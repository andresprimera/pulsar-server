import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
}
