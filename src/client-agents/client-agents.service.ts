import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';

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
  ) {}

  async create(data: CreateClientAgentDto): Promise<ClientAgent> {
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

    try {
      return await this.clientAgentRepository.create({
        ...data,
        status: 'active',
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
