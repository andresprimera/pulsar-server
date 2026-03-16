import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { encrypt, encryptRecord } from '@shared/crypto.util';

import { assertCurrencyMatch } from '@domain/billing/currency.validator';
import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';
import { ClientsService } from '@clients/clients.service';
import { AgentsService } from '@agents/agents.service';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';

@Injectable()
export class ClientAgentsService {
  private readonly logger = new Logger(ClientAgentsService.name);

  constructor(
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientsService: ClientsService,
    private readonly agentsService: AgentsService,
    private readonly channelRepository: ChannelRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
    private readonly agentPriceRepository: AgentPriceRepository,
    private readonly channelPriceRepository: ChannelPriceRepository,
    private readonly personalityRepository: PersonalityRepository,
  ) {}

  async create(data: CreateClientAgentDto): Promise<ClientAgent> {
    if (!Array.isArray(data.channels) || data.channels.length === 0) {
      throw new BadRequestException('At least one channel is required');
    }

    const client = await this.clientsService.findById(data.clientId);
    if (!client || client.status !== 'active') {
      throw new BadRequestException('Client not found or not active');
    }

    const agent = await this.agentsService.findOne(data.agentId);
    if (!agent || agent.status !== 'active') {
      throw new BadRequestException('Agent not found or not active');
    }

    const personality = await this.personalityRepository.findActiveById(
      data.personalityId,
    );
    if (!personality) {
      throw new BadRequestException('Personality not found or not active');
    }

    const currency = client.billingCurrency;
    const agentIdObj = new Types.ObjectId(data.agentId);

    const agentPrice =
      await this.agentPriceRepository.findActiveByAgentAndCurrency(
        agentIdObj,
        currency,
      );
    if (!agentPrice && data.pricingOverride?.agentAmount == null) {
      throw new BadRequestException(
        `No active price found for agent in currency ${currency}`,
      );
    }
    const agentAmount =
      data.pricingOverride?.agentAmount ?? agentPrice?.amount ?? 0;
    const agentPricing = {
      amount: agentAmount,
      currency,
      monthlyTokenQuota:
        data.pricingOverride?.agentMonthlyTokenQuota ??
        agent.monthlyTokenQuota ??
        null,
    };

    // Fail fast: check if agent is already hired by this client
    const existing = await this.clientAgentRepository.findByClientAndAgent(
      data.clientId,
      data.agentId,
    );
    if (existing && existing.status !== 'archived') {
      throw new ConflictException('Agent already hired by this client');
    }

    const processedChannelIds = new Set<string>();
    const channels = [];

    for (const channelConfig of data.channels) {
      if (processedChannelIds.has(channelConfig.channelId)) {
        throw new BadRequestException(
          `Duplicate channelId in request: ${channelConfig.channelId}`,
        );
      }
      processedChannelIds.add(channelConfig.channelId);

      const channel = await this.channelRepository.findByIdOrFail(
        channelConfig.channelId,
      );

      const normalizedProvider = channelConfig.provider.toLowerCase().trim();
      if (!channel.supportedProviders.includes(normalizedProvider)) {
        throw new BadRequestException(
          `Provider "${channelConfig.provider}" is not supported by channel "${
            channel.name
          }". Supported: ${channel.supportedProviders.join(', ')}`,
        );
      }

      const channelIdObj = new Types.ObjectId(channelConfig.channelId);
      const channelPrice =
        await this.channelPriceRepository.findActiveByChannelAndCurrency(
          channelIdObj,
          currency,
        );
      if (!channelPrice && channelConfig.amountOverride == null) {
        throw new BadRequestException(
          `No active price found for channel in currency ${currency}`,
        );
      }
      const channelAmount =
        channelConfig.amountOverride ?? channelPrice?.amount ?? 0;
      const channelMonthlyMessageQuota =
        channelConfig.monthlyMessageQuotaOverride ??
        channel.monthlyMessageQuota ??
        null;

      let phoneNumberId: string | undefined;
      if (
        channelConfig.credentials &&
        'phoneNumberId' in channelConfig.credentials
      ) {
        phoneNumberId = channelConfig.credentials.phoneNumberId;
      }

      if (phoneNumberId) {
        await this.clientPhoneRepository.resolveOrCreate(
          data.clientId,
          phoneNumberId,
          {
            provider: normalizedProvider as any,
          },
        );
      }

      let tiktokUserId: string | undefined;
      if (
        channelConfig.credentials &&
        'tiktokUserId' in channelConfig.credentials
      ) {
        tiktokUserId = channelConfig.credentials.tiktokUserId;
      }

      let instagramAccountId: string | undefined;
      if (
        channelConfig.credentials &&
        'instagramAccountId' in channelConfig.credentials
      ) {
        instagramAccountId = channelConfig.credentials.instagramAccountId;
      }

      const credentialsToStore = channelConfig.credentials;

      channels.push({
        channelId: channelIdObj,
        provider: normalizedProvider,
        status: 'active',
        credentials: encryptRecord(credentialsToStore),
        phoneNumberId,
        tiktokUserId,
        instagramAccountId,
        amount: channelAmount,
        currency,
        monthlyMessageQuota: channelMonthlyMessageQuota,
      });
    }

    try {
      assertCurrencyMatch(agentPricing.currency, client.billingCurrency);
      for (const ch of channels) {
        assertCurrencyMatch(ch.currency, client.billingCurrency);
      }
    } catch {
      throw new BadRequestException(
        'Pricing currency must match client billing currency',
      );
    }

    try {
      return await this.clientAgentRepository.create({
        clientId: data.clientId,
        agentId: data.agentId,
        personalityId: new Types.ObjectId(data.personalityId),
        agentPricing,
        billingAnchor: new Date(),
        status: 'active',
        channels,
      });
    } catch (error: any) {
      // Handle MongoDB duplicate key error (race condition fallback)
      if (error?.code === 11000) {
        throw new ConflictException('Agent already hired by this client');
      }
      throw error;
    }
  }

  async findByClient(clientId: string): Promise<ClientAgent[]> {
    return this.clientAgentRepository.findByClient(clientId);
  }

  async update(id: string, data: UpdateClientAgentDto): Promise<ClientAgent> {
    const clientAgent = await this.clientAgentRepository.findById(id);
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }

    if (clientAgent.status === 'archived') {
      throw new BadRequestException('Cannot update archived ClientAgent');
    }

    const updatePayload: Partial<ClientAgent> = {};
    if (data.personalityId !== undefined) {
      const personality = await this.personalityRepository.findActiveById(
        data.personalityId,
      );
      if (!personality) {
        throw new BadRequestException('Personality not found or not active');
      }
      updatePayload.personalityId = new Types.ObjectId(data.personalityId);
    }

    if (Object.keys(updatePayload).length === 0) {
      return clientAgent;
    }

    const updated = await this.clientAgentRepository.update(id, updatePayload);
    if (!updated)
      throw new NotFoundException('ClientAgent not found after update');
    return updated;
  }

  async updateStatus(
    id: string,
    data: UpdateClientAgentStatusDto,
  ): Promise<ClientAgent> {
    const clientAgent = await this.clientAgentRepository.findById(id);
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }

    if (clientAgent.status === 'archived') {
      throw new BadRequestException('Cannot modify archived ClientAgent');
    }

    const updated = await this.clientAgentRepository.update(id, {
      status: data.status,
    });
    if (!updated)
      throw new NotFoundException('ClientAgent not found after update');

    // Cascade archive happens implicitly because channels are embedded
    if (data.status === 'archived') {
      this.logger.log(
        `[ClientAgent] Archived ClientAgent clientId=${clientAgent.clientId}, agentId=${clientAgent.agentId} (Channels embedded)`,
      );
    }

    return updated;
  }

  async calculateClientTotal(
    clientId: string,
  ): Promise<{ total: number; currency: string }> {
    const client = await this.clientsService.findById(clientId);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const activeClientAgents =
      await this.clientAgentRepository.findByClientAndStatus(
        clientId,
        'active',
      );

    if (activeClientAgents.length === 0) {
      return { total: 0, currency: client.billingCurrency };
    }

    const hasMismatch = activeClientAgents.some(
      (ca) => ca.agentPricing.currency !== client.billingCurrency,
    );
    if (hasMismatch) {
      throw new InternalServerErrorException(
        'Mixed currency subscriptions detected — data integrity violation',
      );
    }

    const total = activeClientAgents.reduce((sum, ca) => {
      const agentAmount = ca.agentPricing.amount;
      const channelsAmount = ca.channels
        .filter((ch) => ch.status === 'active')
        .reduce((chSum, ch) => chSum + ch.amount, 0);
      return sum + agentAmount + channelsAmount;
    }, 0);

    return { total, currency: client.billingCurrency };
  }
}
