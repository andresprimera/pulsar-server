import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AgentPrice } from '@persistence/schemas/agent-price.schema';

@Injectable()
export class AgentPriceRepository {
  constructor(
    @InjectModel(AgentPrice.name)
    private readonly model: Model<AgentPrice>,
  ) {}

  async findActiveByAgentAndCurrency(
    agentId: Types.ObjectId,
    currency: string,
  ): Promise<AgentPrice | null> {
    const normalized = currency.trim().toUpperCase();
    return this.model
      .findOne({
        agentId,
        currency: normalized,
        status: 'active',
      })
      .exec();
  }

  async upsert(
    agentId: Types.ObjectId,
    currency: string,
    amount: number,
  ): Promise<AgentPrice> {
    const normalized = currency.trim().toUpperCase();
    const existing = await this.model
      .findOne({ agentId, currency: normalized })
      .exec();
    if (existing) {
      const updated = await this.model
        .findByIdAndUpdate(
          existing._id,
          { amount, status: 'active' },
          { new: true },
        )
        .exec();
      if (!updated) throw new Error('Agent price update failed');
      return updated;
    }
    const [doc] = await this.model.create([
      { agentId, currency: normalized, amount, status: 'active' },
    ]);
    return doc;
  }

  async deprecate(
    agentId: Types.ObjectId,
    currency: string,
  ): Promise<AgentPrice | null> {
    const normalized = currency.trim().toUpperCase();
    return this.model
      .findOneAndUpdate(
        { agentId, currency: normalized },
        { status: 'deprecated' },
        { new: true },
      )
      .exec();
  }

  async findByAgent(agentId: Types.ObjectId): Promise<AgentPrice[]> {
    return this.model.find({ agentId }).sort({ currency: 1 }).exec();
  }
}
