import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRepository } from './repositories/user.repository';
import { Agent } from './schemas/agent.schema';

import { ClientPhone } from './schemas/client-phone.schema';
import { ClientAgent } from './schemas/client-agent.schema';
import { OnboardingService } from '@onboarding/onboarding.service';
import { ChannelRepository } from './repositories/channel.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { ClientPhoneRepository } from './repositories/client-phone.repository';
import { AgentPriceRepository } from './repositories/agent-price.repository';
import { ChannelPriceRepository } from './repositories/channel-price.repository';
import { encryptRecord, encrypt } from '@shared/crypto.util';
import * as SEED_DATA from './data/seed-data.json';
import { ClientRepository } from './repositories/client.repository';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);
  private readonly onboardingRetryAttempts = 3;

  constructor(
    private readonly userRepository: UserRepository,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    @InjectModel(ClientPhone.name)
    private readonly clientPhoneModel: Model<ClientPhone>,
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboardingService: OnboardingService,
    private readonly channelRepository: ChannelRepository,
    private readonly clientRepository: ClientRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
    private readonly agentPriceRepository: AgentPriceRepository,
    private readonly channelPriceRepository: ChannelPriceRepository,
    @InjectModel(ClientAgent.name)
    private readonly clientAgentModel: Model<ClientAgent>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pulsar';
    this.logger.log(
      `Connected to Database: ${uri.replace(/:([^:@]+)@/, ':****@')}`,
    );

    const nodeEnv = process.env.NODE_ENV;
    const isProd = nodeEnv === 'production';
    const isTest = nodeEnv === 'test';

    const startSeed =
      isProd || isTest
        ? process.env.SEED_DB === 'true' // Prod/Test: Must be explicit
        : process.env.SEED_DB !== 'false'; // Dev: Default on, explicit off

    if (!startSeed) {
      this.logger.log(
        `Skipping seeding (NODE_ENV=${process.env.NODE_ENV}, SEED_DB=${process.env.SEED_DB})`,
      );
      return;
    }

    await this.seed();
  }

  private async seed(): Promise<void> {
    this.logger.log('Starting database seed...');

    try {
      // Idempotency check: if first seed user exists, skip entire seeding
      const existingUser = await this.userRepository.findByEmail(
        SEED_DATA.users[0].email,
      );
      if (existingUser) {
        // Check for consistency: if user exists, Client and ClientAgent MUST exist
        const client = await this.clientRepository.findById(
          (existingUser.clientId as any).toString(),
        );
        const clientAgents = await this.clientAgentRepository.findByClient(
          (existingUser.clientId as any).toString(),
        );

        if (!client || clientAgents.length === 0) {
          this.logger.error(
            `[Seeder] Inconsistent state detected: Seed user "${SEED_DATA.users[0].email}" exists, but Client or ClientAgent is missing.`,
          );
          throw new Error(
            `Database is in an inconsistent state. Seed user exists but Client/Agent data is missing. Please drop the database or remove the seed user manually to fix this.`,
          );
        }

        this.logger.log(
          `Seed user "${SEED_DATA.users[0].email}" already exists. Skipping seeding.`,
        );
        return;
      }

      // 1. Ensure Agents exist (required for onboarding)
      const agentsMap = new Map();
      for (const agentSeed of SEED_DATA.agents) {
        let agent = await this.agentModel
          .findOne({ name: agentSeed.name })
          .exec();
        if (!agent) {
          this.logger.log(`Creating Agent: ${agentSeed.name}`);
          agent = await this.agentModel.create({
            name: agentSeed.name,
            systemPrompt: agentSeed.systemPrompt,
            status: agentSeed.status,
            createdBySeeder: true,
            ...((agentSeed as any).monthlyTokenQuota != null
              ? { monthlyTokenQuota: (agentSeed as any).monthlyTokenQuota }
              : {}),
          });
        } else {
          this.logger.log(
            `Agent "${agentSeed.name}" already exists (${agent._id})`,
          );
        }
        agentsMap.set(agentSeed.name, agent);
      }

      // 2. Ensure Channels exist (Infrastructure provisioning)
      this.logger.log('Provisioning channels...');
      const channelsMap = new Map();
      for (const channelSeed of SEED_DATA.channels) {
        const channel = await this.channelRepository.findOrCreateByName(
          channelSeed.name,
          {
            type: channelSeed.type as any,
            supportedProviders: channelSeed.supportedProviders.map((p) =>
              p.toLowerCase(),
            ),
            ...((channelSeed as any).monthlyMessageQuota != null
              ? {
                  monthlyMessageQuota: (channelSeed as any).monthlyMessageQuota,
                }
              : {}),
          },
        );
        channelsMap.set(channelSeed.name, { channel });
      }

      // 3. Pre-seed full catalog (AgentPrice + ChannelPrice) in default currency before any user
      const defaultCurrency = (SEED_DATA as any).billingCurrency ?? 'USD';
      this.logger.log(
        `Seeding catalog prices (${defaultCurrency}) for all agents and channels...`,
      );
      const agentPriceByAgentName = this.getDefaultAgentPricesFromSeed();
      for (const agentSeed of SEED_DATA.agents) {
        const agent = agentsMap.get(agentSeed.name);
        if (!agent) continue;
        const amount =
          agentPriceByAgentName.get(agentSeed.name) ??
          (agentSeed as any).defaultPrice ??
          0;
        await this.agentPriceRepository.upsert(
          agent._id as Types.ObjectId,
          defaultCurrency,
          amount,
        );
      }
      for (const channelSeed of SEED_DATA.channels) {
        const channelInfo = channelsMap.get(channelSeed.name);
        if (!channelInfo?.channel?._id) continue;
        const amount = (channelSeed as any).amount ?? 0;
        await this.channelPriceRepository.upsert(
          channelInfo.channel._id as Types.ObjectId,
          defaultCurrency,
          amount,
        );
      }

      // Ensure indexes are built before transaction starts to avoid "catalog changes" error
      this.logger.log('Ensuring indexes are built...');
      await Promise.all([
        this.clientPhoneModel.createIndexes(),
        this.clientAgentModel.createIndexes(),
      ]);

      // 4. Process each user
      for (const userSeed of SEED_DATA.users) {
        const resolveHiringChannels = (hiringSeed: any) => {
          const channelsFromHiring = Array.isArray(hiringSeed.channels)
            ? hiringSeed.channels
            : [];

          return channelsFromHiring;
        };

        const assertHiringChannelsOrThrow = (hiringSeed: any) => {
          const hiringChannels = resolveHiringChannels(hiringSeed);
          if (hiringChannels.length === 0) {
            const agentName = hiringSeed?.agentName || 'unknown-agent';
            this.logger.error(
              `Invalid seed for user "${userSeed.email}": agent hiring "${agentName}" has no channels configured.`,
            );
            throw new Error(
              `Invalid seed-data.json: user "${userSeed.email}" agent hiring "${agentName}" must include at least one channel in agentHirings[].channels.`,
            );
          }
        };

        this.logger.log(
          `Processing user: ${userSeed.email} (${userSeed.name})`,
        );

        // Check if user already exists
        const existingUserCheck = await this.userRepository.findByEmail(
          userSeed.email,
        );
        if (existingUserCheck) {
          this.logger.log(`User "${userSeed.email}" already exists. Skipping.`);
          continue;
        }

        // If user has no agent hirings, skip (for now, as onboarding requires an agent)
        if (!userSeed.agentHirings || userSeed.agentHirings.length === 0) {
          this.logger.log(
            `User "${userSeed.email}" has no agents to hire. Skipping for now.`,
          );
          continue;
        }

        // Process first agent hiring using onboarding service
        const firstAgentHiring = userSeed.agentHirings[0];
        assertHiringChannelsOrThrow(firstAgentHiring);
        const firstAgent = agentsMap.get(firstAgentHiring.agentName);
        if (!firstAgent) {
          this.logger.warn(
            `Agent "${firstAgentHiring.agentName}" not found for user "${userSeed.email}". Skipping user.`,
          );
          continue;
        }

        // Build channels DTO based on the hired agent's channel config
        const channelsDto = [];
        const firstHiringChannels = resolveHiringChannels(firstAgentHiring);
        for (const channelSeed of firstHiringChannels) {
          const channelInfo = channelsMap.get(channelSeed.channelName);
          if (!channelInfo) {
            this.logger.warn(
              `Channel "${channelSeed.channelName}" not found for user "${userSeed.email}". Skipping.`,
            );
            continue;
          }

          const provider =
            channelSeed.provider || channelInfo.channel.supportedProviders[0];

          channelsDto.push({
            channelId: channelInfo.channel._id.toString(),
            provider: provider,
            status: channelSeed.status || 'active',
            credentials: channelSeed.credentials,
            llmConfig: channelSeed.llmConfig,
          });
        }

        if (channelsDto.length === 0) {
          this.logger.warn(
            `No valid channels for user "${userSeed.email}". Skipping.`,
          );
          continue;
        }

        const billingCurrency =
          (userSeed.client as any)?.billingCurrency ?? defaultCurrency;

        // Use OnboardingService to create User, Client, and first ClientAgent
        this.logger.log(
          `Running onboarding flow for user "${userSeed.email}" with agent "${firstAgentHiring.agentName}"...`,
        );
        const result = await this.runOnboardingWithRetry({
          user: {
            email: userSeed.email,
            name: userSeed.name,
          },
          client: {
            type: userSeed.client.type as any,
            ...(userSeed.client.name ? { name: userSeed.client.name } : {}),
            billingCurrency,
          },
          agentHiring: {
            agentId: firstAgent._id.toString(),
          },
          channels: channelsDto as any,
        });

        this.logger.log(`User onboarded successfully:`);
        this.logger.log(`  - User: ${result.user._id} (${result.user.email})`);
        this.logger.log(
          `  - Client: ${result.client._id} (${result.client.name})`,
        );
        this.logger.log(`  - ClientAgent: ${result.clientAgent._id}`);

        // Process additional agent hirings if any
        if (userSeed.agentHirings.length > 1) {
          const client = await this.clientRepository.findById(
            result.client._id,
          );
          if (!client) {
            this.logger.warn(
              `Client ${result.client._id} not found; skipping additional hirings for ${userSeed.email}.`,
            );
          } else {
            for (let i = 1; i < userSeed.agentHirings.length; i++) {
              const additionalHiring = userSeed.agentHirings[i];
              const additionalAgent = agentsMap.get(additionalHiring.agentName);
              if (!additionalAgent) {
                this.logger.warn(
                  `Agent "${additionalHiring.agentName}" not found for additional hiring. Skipping.`,
                );
                continue;
              }

              assertHiringChannelsOrThrow(additionalHiring);

              // Prepare channels for additional agent
              const additionalChannels = [];
              const additionalHiringChannels =
                resolveHiringChannels(additionalHiring);

              for (const channelSeed of additionalHiringChannels) {
                const channelInfo = channelsMap.get(channelSeed.channelName);
                if (!channelInfo) {
                  continue;
                }

                const provider =
                  channelSeed.provider ||
                  channelInfo.channel.supportedProviders[0];

                // Handle phone number for WhatsApp channels
                let phoneNumberId: string | undefined;
                if (
                  channelSeed.credentials &&
                  'phoneNumberId' in channelSeed.credentials
                ) {
                  phoneNumberId = channelSeed.credentials.phoneNumberId;
                }

                if (phoneNumberId) {
                  // Ensure ClientPhone exists for this phone number
                  try {
                    const clientId = result.client._id;
                    if (!Types.ObjectId.isValid(clientId)) {
                      this.logger.warn(
                        `Skipping ClientPhone creation for invalid clientId "${clientId}" during seeding.`,
                      );
                      continue;
                    }

                    await this.clientPhoneRepository.resolveOrCreate(
                      clientId,
                      phoneNumberId,
                      {
                        provider: provider.toLowerCase() as any,
                      },
                    );
                  } catch (error) {
                    // Phone may already be owned by another client from a previous seed user
                    // This is expected when multiple seed users share the same channel config
                    if (error.status === 409) {
                      this.logger.warn(
                        `Phone ${phoneNumberId} already owned by another client. Skipping for additional agent.`,
                      );
                    } else {
                      throw error;
                    }
                  }
                }

                // Handle tiktokUserId for TikTok channels
                let tiktokUserId: string | undefined;
                if (
                  channelSeed.credentials &&
                  'tiktokUserId' in channelSeed.credentials
                ) {
                  tiktokUserId = channelSeed.credentials.tiktokUserId;
                }

                // Handle instagramAccountId for Instagram channels
                let instagramAccountId: string | undefined;
                if (
                  channelSeed.credentials &&
                  'instagramAccountId' in channelSeed.credentials
                ) {
                  instagramAccountId =
                    channelSeed.credentials.instagramAccountId;
                }

                additionalChannels.push({
                  channelId: channelInfo.channel._id as Types.ObjectId,
                  provider: provider.toLowerCase(),
                  status: channelSeed.status || 'active',
                  credentials: encryptRecord(channelSeed.credentials),
                  phoneNumberId,
                  tiktokUserId,
                  instagramAccountId,
                  llmConfig: {
                    ...channelSeed.llmConfig,
                    apiKey: encrypt(channelSeed.llmConfig.apiKey),
                  },
                  amount: 0,
                  currency: client.billingCurrency,
                  monthlyMessageQuota:
                    (channelInfo.channel as any).monthlyMessageQuota ?? null,
                });
              }

              // Create additional ClientAgent using client's billing anchor and currency
              this.logger.log(
                `Hiring additional agent "${additionalHiring.agentName}" for client "${result.client._id}"...`,
              );
              const additionalClientAgent =
                await this.clientAgentRepository.create({
                  clientId: result.client._id,
                  agentId: additionalAgent._id.toString(),
                  agentPricing: {
                    amount: additionalHiring.price ?? 0,
                    currency: client.billingCurrency,
                    monthlyTokenQuota:
                      (additionalAgent as any).monthlyTokenQuota ?? null,
                  },
                  billingAnchor: client.billingAnchor,
                  status: 'active',
                  channels: additionalChannels,
                });

              this.logger.log(
                `  - Additional ClientAgent: ${additionalClientAgent._id}`,
              );
            }
          }
        }
      }

      this.logger.log('Seeding complete!');
    } catch (error) {
      this.logger.error('Seeding failed', error);
      throw error;
    }
  }

  private async runOnboardingWithRetry(dto: any): Promise<any> {
    for (let attempt = 1; attempt <= this.onboardingRetryAttempts; attempt++) {
      try {
        return await this.onboardingService.registerAndHire(dto);
      } catch (error) {
        const isRetryable = this.isTransientMongoTransactionError(error);
        const hasMoreAttempts = attempt < this.onboardingRetryAttempts;

        if (!isRetryable || !hasMoreAttempts) {
          throw error;
        }

        const delayMs = attempt * 250;
        this.logger.warn(
          `Transient transaction error during onboarding. Retrying (${
            attempt + 1
          }/${this.onboardingRetryAttempts}) in ${delayMs}ms...`,
        );
        await this.sleep(delayMs);
      }
    }

    throw new Error('Onboarding retry loop exhausted unexpectedly.');
  }

  private isTransientMongoTransactionError(error: any): boolean {
    const labels = Array.isArray(error?.errorLabels) ? error.errorLabels : [];
    const message = String(error?.message || '');

    return (
      labels.includes('TransientTransactionError') ||
      labels.includes('UnknownTransactionCommitResult') ||
      message.includes(
        'Please retry your operation or multi-document transaction',
      ) ||
      message.includes('TransientTransactionError')
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Derives default agent price per agent name from first occurrence in users' agentHirings.
   * Used to pre-seed catalog when agents[] does not define defaultPrice.
   */
  private getDefaultAgentPricesFromSeed(): Map<string, number> {
    const map = new Map<string, number>();
    for (const user of SEED_DATA.users) {
      const hirings = user.agentHirings ?? [];
      for (const h of hirings) {
        const name = h.agentName;
        if (name && !map.has(name) && (h as any).price != null) {
          map.set(name, (h as any).price);
        }
      }
    }
    return map;
  }
}
