import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { UpsertAgentPriceDto } from './dto/upsert-agent-price.dto';

const CURRENCY_REGEX = /^[A-Z]{3}$/;

@Injectable()
export class AgentPricesService {
  constructor(
    private readonly agentPriceRepository: AgentPriceRepository,
    private readonly agentRepository: AgentRepository,
  ) {}

  private validateCurrency(currency: string): string {
    const normalized = currency.toUpperCase();
    if (!CURRENCY_REGEX.test(normalized)) {
      throw new BadRequestException(
        'Currency must be a valid ISO 4217 code (e.g. USD, EUR, BRL)',
      );
    }
    return normalized;
  }

  async upsert(agentId: string, currency: string, dto: UpsertAgentPriceDto) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    const normalized = this.validateCurrency(currency);
    return this.agentPriceRepository.upsert(
      new Types.ObjectId(agentId),
      normalized,
      dto.amount,
    );
  }

  async findByAgent(agentId: string) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return this.agentPriceRepository.findByAgent(new Types.ObjectId(agentId));
  }

  async deprecate(agentId: string, currency: string) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    const normalized = this.validateCurrency(currency);
    const updated = await this.agentPriceRepository.deprecate(
      new Types.ObjectId(agentId),
      normalized,
    );
    if (!updated) {
      throw new NotFoundException(
        `No price found for agent ${agentId} in currency ${normalized}`,
      );
    }
    return updated;
  }
}
