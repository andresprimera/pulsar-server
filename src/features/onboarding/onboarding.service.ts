import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  assertCurrencyMatch,
  isValidCurrencyCode,
} from '@domain/billing/currency.validator';
import { RegisterAndHireDto } from './dto/register-and-hire.dto';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { encryptRecord, encrypt } from '@shared/crypto.util';

export interface RegisterAndHireResult {
  user: {
    _id: string;
    email: string;
    name: string;
    clientId: string;
    status: string;
  };
  client: {
    _id: string;
    type: string;
    name: string;
    ownerUserId: string;
    status: string;
    companyBrief?: string;
  };
  clientAgent: {
    _id: string;
    clientId: string;
    agentId: string;
    agentPricing: { amount: number; currency: string };
    status: string;
    promptSupplement?: string;
  };
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clientRepository: ClientRepository,
    private readonly userRepository: UserRepository,
    private readonly agentRepository: AgentRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly personalityRepository: PersonalityRepository,
    private readonly agentPriceRepository: AgentPriceRepository,
    private readonly channelPriceRepository: ChannelPriceRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
  ) {}

  async registerAndHire(
    dto: RegisterAndHireDto,
  ): Promise<RegisterAndHireResult> {
    // PRE-TRANSACTION VALIDATIONS (fail fast, no rollback needed)

    // 1. Normalize email
    const normalizedEmail = dto.user.email.toLowerCase().trim();

    // 2. Validate agent is hireable and get agent for quota
    const agent = await this.agentRepository.validateHireable(
      dto.agentHiring.agentId,
    );

    // 3. Validate personality is active
    const personality = await this.personalityRepository.findActiveById(
      dto.agentHiring.personalityId,
    );
    if (!personality) {
      throw new BadRequestException('Personality not found or not active');
    }

    // 4. Validate client name for organization type
    if (dto.client.type === 'organization' && !dto.client.name) {
      throw new BadRequestException(
        'Client name is required for organization type',
      );
    }

    // 5. Channels are validated during processing below

    // TRANSACTION (atomic writes)
    const session = await this.connection.startSession();
    session.startTransaction();

    let client: Awaited<ReturnType<ClientRepository['create']>> | undefined;
    let user: Awaited<ReturnType<UserRepository['create']>> | undefined;
    let clientAgent:
      | Awaited<ReturnType<ClientAgentRepository['create']>>
      | undefined;

    try {
      // 5. Check user email doesn't exist (inside transaction for consistency
      //    under concurrent onboarding — prevents two requests from both passing
      //    this check and producing a less descriptive E11000 error)
      const existingUser = await this.userRepository.findByEmail(
        normalizedEmail,
      );
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }
      // 6. Create Client
      const clientName = dto.client.name || dto.user.name;
      const billingCurrency = (
        dto.client.billingCurrency ?? 'USD'
      ).toUpperCase();
      if (!isValidCurrencyCode(billingCurrency)) {
        throw new BadRequestException('Invalid ISO 4217 currency code');
      }
      const clientPayload: Parameters<ClientRepository['create']>[0] = {
        name: clientName,
        type: dto.client.type,
        status: 'active',
        billingCurrency,
        billingAnchor: new Date(),
      };
      if (dto.client.llmConfig) {
        clientPayload.llmConfig = {
          provider: dto.client.llmConfig.provider,
          apiKey: encrypt(dto.client.llmConfig.apiKey),
          model: dto.client.llmConfig.model,
        };
      }
      const briefTrimmed = dto.client.companyBrief?.trim();
      if (briefTrimmed) {
        clientPayload.companyBrief = briefTrimmed;
      }
      client = await this.clientRepository.create(clientPayload, session);

      // 7. Create User
      user = await this.userRepository.create(
        {
          email: normalizedEmail,
          name: dto.user.name,
          clientId: client._id as Types.ObjectId,
          status: 'active',
        },
        session,
      );

      // 8. Update Client with ownerUserId
      await this.clientRepository.update(
        (client._id as Types.ObjectId).toString(),
        { ownerUserId: user._id as Types.ObjectId },
        session,
      );

      // Resolve agent price for client billing currency
      const agentIdObj = new Types.ObjectId(dto.agentHiring.agentId);
      const agentPrice =
        await this.agentPriceRepository.findActiveByAgentAndCurrency(
          agentIdObj,
          billingCurrency,
        );
      if (!agentPrice && dto.agentHiring.pricingOverride?.agentAmount == null) {
        throw new BadRequestException(
          `No active price found for agent in currency ${billingCurrency}`,
        );
      }
      const agentAmount =
        dto.agentHiring.pricingOverride?.agentAmount ?? agentPrice?.amount ?? 0;
      const agentPricing = {
        amount: agentAmount,
        currency: billingCurrency,
        monthlyTokenQuota:
          dto.agentHiring.pricingOverride?.agentMonthlyTokenQuota ??
          agent.monthlyTokenQuota ??
          null,
      };

      // 10. Process Channels
      const hireChannels = [];
      const processedChannelIds = new Set<string>();

      for (const channelConfig of dto.channels) {
        const platformHosted = Boolean(channelConfig.platformHosted);

        // Validation: Unique channelId in request
        if (processedChannelIds.has(channelConfig.channelId)) {
          throw new BadRequestException(
            `Duplicate channelId in request: ${channelConfig.channelId}`,
          );
        }
        processedChannelIds.add(channelConfig.channelId);

        // Validation: Channel exists (Infrastructure)
        const channel = await this.channelRepository.findByIdOrFail(
          channelConfig.channelId,
        );

        const normalizedProvider = (() => {
          if (platformHosted && !channelConfig.provider) {
            const first = channel.supportedProviders?.[0]
              ?.toLowerCase()
              ?.trim();
            if (!first) {
              throw new BadRequestException(
                `Channel "${channel.name}" has no supported providers; platform-hosted onboarding is unavailable.`,
              );
            }
            return first;
          }
          const fromDto = channelConfig.provider?.toLowerCase()?.trim();
          if (!fromDto) {
            throw new BadRequestException(
              'Provider is required unless platformHosted is true.',
            );
          }
          return fromDto;
        })();

        if (!channel.supportedProviders.includes(normalizedProvider)) {
          throw new BadRequestException(
            `Provider "${normalizedProvider}" is not supported by channel "${
              channel.name
            }". Supported: ${channel.supportedProviders.join(', ')}`,
          );
        }

        const channelIdObj = new Types.ObjectId(channelConfig.channelId);
        const channelPrice =
          await this.channelPriceRepository.findActiveByChannelAndCurrency(
            channelIdObj,
            billingCurrency,
          );
        if (!channelPrice && channelConfig.amountOverride == null) {
          throw new BadRequestException(
            `No active price found for channel in currency ${billingCurrency}`,
          );
        }
        const channelAmount =
          channelConfig.amountOverride ?? channelPrice?.amount ?? 0;
        const channelMonthlyMessageQuota =
          channelConfig.monthlyMessageQuotaOverride ??
          channel.monthlyMessageQuota ??
          null;

        // Routing identifiers: from credentials when present, else from routingIdentifier (meaning depends on channel.type)
        let phoneNumberId: string | undefined;
        let tiktokUserId: string | undefined;
        let instagramAccountId: string | undefined;

        if (
          channelConfig.credentials &&
          typeof channelConfig.credentials === 'object'
        ) {
          if ('phoneNumberId' in channelConfig.credentials) {
            phoneNumberId = channelConfig.credentials.phoneNumberId;
          }
          if ('tiktokUserId' in channelConfig.credentials) {
            tiktokUserId = channelConfig.credentials.tiktokUserId;
          }
          if ('instagramAccountId' in channelConfig.credentials) {
            instagramAccountId = channelConfig.credentials.instagramAccountId;
          }
        }
        if (channelConfig.routingIdentifier?.trim()) {
          const rid = channelConfig.routingIdentifier.trim();
          if (channel.type === 'whatsapp') {
            phoneNumberId = phoneNumberId ?? rid;
          } else if (channel.type === 'instagram') {
            instagramAccountId = instagramAccountId ?? rid;
          } else if (channel.type === 'tiktok') {
            tiktokUserId = tiktokUserId ?? rid;
          }
        }

        const needsRoutingId =
          channel.type === 'whatsapp' ||
          channel.type === 'instagram' ||
          channel.type === 'tiktok';
        const hasRoutingId =
          phoneNumberId || tiktokUserId || instagramAccountId;
        if (needsRoutingId && !hasRoutingId && !platformHosted) {
          throw new BadRequestException(
            `Channel "${channel.name}" requires either credentials (with the appropriate routing field) or routingIdentifier.`,
          );
        }

        if (phoneNumberId) {
          await this.clientPhoneRepository.resolveOrCreate(
            client._id as Types.ObjectId,
            phoneNumberId,
            {
              provider: normalizedProvider as any,
              session,
            },
          );
        }

        let credentialsToStore: Record<string, unknown> | undefined;
        if (
          channelConfig.credentials &&
          typeof channelConfig.credentials === 'object' &&
          Object.keys(channelConfig.credentials).length > 0
        ) {
          credentialsToStore = encryptRecord({
            ...channelConfig.credentials,
          });
        }

        hireChannels.push({
          channelId: channelIdObj,
          provider: normalizedProvider,
          status: 'active',
          credentials: credentialsToStore,
          phoneNumberId,
          tiktokUserId,
          instagramAccountId,
          amount: channelAmount,
          currency: billingCurrency,
          monthlyMessageQuota: channelMonthlyMessageQuota,
        });
      }

      try {
        assertCurrencyMatch(agentPricing.currency, client.billingCurrency);
        for (const ch of hireChannels) {
          assertCurrencyMatch(ch.currency, client.billingCurrency);
        }
      } catch {
        throw new BadRequestException(
          'Pricing currency must match client billing currency',
        );
      }

      const hireSupplementTrimmed = dto.agentHiring.promptSupplement?.trim();

      // 9. Create ClientAgent (pricing snapshot + channels + personality)
      clientAgent = await this.clientAgentRepository.create(
        {
          clientId: (client._id as Types.ObjectId).toString(),
          agentId: dto.agentHiring.agentId,
          personalityId: new Types.ObjectId(dto.agentHiring.personalityId),
          agentPricing,
          billingAnchor: new Date(),
          status: 'active',
          channels: hireChannels,
          ...(hireSupplementTrimmed
            ? { promptSupplement: hireSupplementTrimmed }
            : {}),
        },
        session,
      );

      // 12. Commit transaction
      await session.commitTransaction();

      // 14. Return response
      return {
        user: {
          _id: (user._id as Types.ObjectId).toString(),
          email: user.email,
          name: user.name,
          clientId: (user.clientId as Types.ObjectId).toString(),
          status: user.status,
        },
        client: {
          _id: (client._id as Types.ObjectId).toString(),
          type: client.type,
          name: client.name,
          ownerUserId: (user._id as Types.ObjectId).toString(),
          status: client.status,
          ...(client.companyBrief?.trim()
            ? { companyBrief: client.companyBrief.trim() }
            : {}),
        },
        clientAgent: {
          _id: (clientAgent._id as Types.ObjectId).toString(),
          clientId: clientAgent.clientId,
          agentId: clientAgent.agentId,
          agentPricing: clientAgent.agentPricing,
          status: clientAgent.status,
          ...(clientAgent.promptSupplement?.trim()
            ? { promptSupplement: clientAgent.promptSupplement.trim() }
            : {}),
        },
      };
    } catch (error) {
      // Abort transaction on error (may already be aborted by MongoDB on E11000)
      try {
        await session.abortTransaction();
      } catch {
        // Transaction already aborted (e.g. after E11000 duplicate key)
      }

      // Map MongoDB 11000 (duplicate key) to 409 Conflict
      if (this.isDuplicateKeyError(error)) {
        const field = this.extractDuplicateField(error);
        throw new ConflictException(`Duplicate value for field: ${field}`);
      }

      // Re-throw other errors
      throw error;
    } finally {
      // Detach session from any created documents so they can be used after
      // endSession() (avoids MongoExpiredSessionError when docs are later
      // read from the identity map by other requests).
      for (const doc of [client, user, clientAgent]) {
        if (doc && typeof (doc as any).$session === 'function') {
          (doc as any).$session(null);
        }
      }
      session.endSession();
    }
  }

  private isDuplicateKeyError(error: any): boolean {
    return (
      error?.code === 11000 ||
      (error?.name === 'MongoServerError' && error?.code === 11000)
    );
  }

  private extractDuplicateField(error: any): string {
    const keyPattern = error?.keyPattern;
    if (keyPattern) {
      return Object.keys(keyPattern).join(', ');
    }

    const match = error?.message?.match(/index: (\w+)/);
    return match ? match[1] : 'unknown';
  }
}
