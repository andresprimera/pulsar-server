import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import {
  EMPTY_PRICES,
  toPlain,
  buildActivePricesMap,
} from '@core/utils/catalog-pricing.util';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly agentPriceRepository: AgentPriceRepository,
  ) {}

  async create(dto: CreateAgentDto) {
    const agent = await this.agentRepository.create({
      ...dto,
      status: 'active',
    });
    const priceMap = await this.buildActivePricesMapByAgentIds([
      agent._id as Types.ObjectId,
    ]);
    const plain = toPlain(agent);
    return {
      ...plain,
      prices: priceMap.get(String(agent._id)) ?? EMPTY_PRICES,
    };
  }

  async findAll(status?: 'active' | 'inactive' | 'archived') {
    const agents = status
      ? await this.agentRepository.findByStatus(status)
      : await this.agentRepository.findAll();
    const agentIds = agents.map((a) => a._id as Types.ObjectId);
    const priceMap = await this.buildActivePricesMapByAgentIds(agentIds);
    return agents.map((agent) => {
      const plain = toPlain(agent);
      return {
        ...plain,
        prices: priceMap.get(String(agent._id)) ?? EMPTY_PRICES,
      };
    });
  }

  async findAvailable() {
    const agents = await this.agentRepository.findByStatus('active');
    const agentIds = agents.map((a) => a._id as Types.ObjectId);
    const priceMap = await this.buildActivePricesMapByAgentIds(agentIds);
    return agents.map((agent) => {
      const plain = toPlain(agent);
      return {
        ...plain,
        prices: priceMap.get(String(agent._id)) ?? EMPTY_PRICES,
      };
    });
  }

  async findOne(id: string) {
    const agent = await this.agentRepository.findById(id);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    const priceMap = await this.buildActivePricesMapByAgentIds([
      agent._id as Types.ObjectId,
    ]);
    const plain = toPlain(agent);
    return {
      ...plain,
      prices: priceMap.get(String(agent._id)) ?? EMPTY_PRICES,
    };
  }

  async update(id: string, dto: UpdateAgentDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived agents cannot be modified');
    }

    const agent = await this.agentRepository.update(id, dto);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    const priceMap = await this.buildActivePricesMapByAgentIds([
      agent._id as Types.ObjectId,
    ]);
    const plain = toPlain(agent);
    return {
      ...plain,
      prices: priceMap.get(String(agent._id)) ?? EMPTY_PRICES,
    };
  }

  async updateStatus(id: string, dto: UpdateAgentStatusDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived agents cannot be modified');
    }

    const agent = await this.agentRepository.update(id, { status: dto.status });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    const priceMap = await this.buildActivePricesMapByAgentIds([
      agent._id as Types.ObjectId,
    ]);
    const plain = toPlain(agent);
    return {
      ...plain,
      prices: priceMap.get(String(agent._id)) ?? EMPTY_PRICES,
    };
  }

  private async buildActivePricesMapByAgentIds(
    agentIds: Types.ObjectId[],
  ): Promise<Map<string, { currency: string; amount: number }[]>> {
    if (agentIds.length === 0) {
      return new Map();
    }
    const prices = await this.agentPriceRepository.findByAgentIds(agentIds);
    return buildActivePricesMap(
      prices,
      (p) => String(p.agentId),
      (p) => p.currency,
      (p) => p.amount,
      (p) => p.status,
    );
  }
}
