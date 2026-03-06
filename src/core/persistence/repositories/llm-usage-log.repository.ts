import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LlmUsageLog } from '@persistence/schemas/llm-usage-log.schema';

@Injectable()
export class LlmUsageLogRepository {
  constructor(
    @InjectModel(LlmUsageLog.name)
    private readonly model: Model<LlmUsageLog>,
  ) {}

  async create(data: Partial<LlmUsageLog>): Promise<LlmUsageLog> {
    const [doc] = await this.model.create([data]);
    return doc;
  }

  async sumTokensForClientAgent(
    clientId: Types.ObjectId,
    agentId: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const result = await this.model
      .aggregate<{ total: number }>([
        {
          $match: {
            clientId,
            agentId,
            createdAt: { $gte: periodStart, $lt: periodEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalTokens' } } },
        { $project: { _id: 0, total: 1 } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }
}
