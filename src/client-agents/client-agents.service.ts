import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { ChannelRepository } from '../database/repositories/channel.repository';
import { ClientPhoneRepository } from '../database/repositories/client-phone.repository';
import { encrypt, encryptRecord } from '../database/utils/crypto.util';

import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';
import { ClientsService } from '../clients/clients.service';
import { AgentsService } from '../agents/agents.service';
import { ClientAgent } from '../database/schemas/client-agent.schema';

@Injectable()
export class ClientAgentsService {
  private readonly logger = new Logger(ClientAgentsService.name);

  constructor(
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientsService: ClientsService,
    private readonly agentsService: AgentsService,
    private readonly channelRepository: ChannelRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
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
          `Provider "${
            channelConfig.provider
          }" is not supported by channel "${
            channel.name
          }". Supported: ${channel.supportedProviders.join(', ')}`,
        );
      }

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

      let email: string | undefined;
      if (channelConfig.credentials && 'email' in channelConfig.credentials) {
        email = channelConfig.credentials.email;
      }

      let tiktokUserId: string | undefined;
      if (
        channelConfig.credentials &&
        'tiktokUserId' in channelConfig.credentials
      ) {
        tiktokUserId = channelConfig.credentials.tiktokUserId;
      }

      channels.push({
        channelId: new Types.ObjectId(channelConfig.channelId),
        provider: normalizedProvider,
        status: 'active',
        credentials: encryptRecord(channelConfig.credentials),
        phoneNumberId,
        email,
        tiktokUserId,
        llmConfig: {
          ...channelConfig.llmConfig,
          apiKey: encrypt(channelConfig.llmConfig.apiKey),
        },
      });
    }

    try {
      return await this.clientAgentRepository.create({
        clientId: data.clientId,
        agentId: data.agentId,
        price: data.price,
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

    const updated = await this.clientAgentRepository.update(id, data);
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

  async calculateClientTotal(clientId: string): Promise<number> {
    const activeClientAgents =
      await this.clientAgentRepository.findByClientAndStatus(
        clientId,
        'active',
      );
    return activeClientAgents.reduce((total, ca) => total + ca.price, 0);
  }
}
