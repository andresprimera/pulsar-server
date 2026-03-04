import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProcessedEvent } from '@persistence/schemas/processed-event.schema';

@Injectable()
export class ProcessedEventRepository {
  constructor(
    @InjectModel(ProcessedEvent.name)
    private readonly model: Model<ProcessedEvent>,
  ) {}

  async create(channel: string, messageId: string): Promise<void> {
    await this.model.create({ channel, messageId });
  }
}
