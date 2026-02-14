import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Message } from '../schemas/message.schema';

@Injectable()
export class MessageRepository {
  constructor(
    @InjectModel(Message.name)
    private readonly model: Model<Message>,
  ) {}

  async create(
    data: Partial<Message>,
    session?: ClientSession,
  ): Promise<Message> {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  async findAll(): Promise<Message[]> {
    return this.model.find().exec();
  }

  async findById(id: string): Promise<Message | null> {
    return this.model.findById(id).exec();
  }

  async findByChannel(channelId: Types.ObjectId): Promise<Message[]> {
    return this.model.find({ channelId }).sort({ createdAt: 1 }).exec();
  }

  async findByUser(userId: Types.ObjectId): Promise<Message[]> {
    return this.model.find({ userId }).sort({ createdAt: 1 }).exec();
  }

  async findByChannelAndUser(
    channelId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Message[]> {
    return this.model.find({ channelId, userId }).sort({ createdAt: 1 }).exec();
  }

  async findByStatus(
    status: 'active' | 'inactive' | 'archived',
  ): Promise<Message[]> {
    return this.model.find({ status }).exec();
  }

  async update(id: string, data: Partial<Message>): Promise<Message | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}
