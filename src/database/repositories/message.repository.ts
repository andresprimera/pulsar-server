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
    return this.model.find().sort({ createdAt: 1 }).exec();
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

  async findByAgent(agentId: Types.ObjectId): Promise<Message[]> {
    return this.model.find({ agentId }).sort({ createdAt: 1 }).exec();
  }

  async findByChannelAndUser(
    channelId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Message[]> {
    return this.model
      .find({ channelId, userId })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findByType(type: 'user' | 'agent' | 'summary'): Promise<Message[]> {
    return this.model.find({ type }).sort({ createdAt: 1 }).exec();
  }

  async findByStatus(
    status: 'active' | 'inactive' | 'archived',
  ): Promise<Message[]> {
    return this.model.find({ status }).sort({ createdAt: 1 }).exec();
  }

  async update(id: string, data: Partial<Message>): Promise<Message | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async findConversationContext(
    channelId: Types.ObjectId,
    userId: Types.ObjectId,
    agentId: Types.ObjectId,
  ): Promise<Message[]> {
    // Find the most recent summary for this conversation
    const lastSummary = await this.model
      .findOne({
        channelId,
        userId,
        agentId,
        type: 'summary',
        status: 'active',
      })
      .sort({ createdAt: -1 })
      .exec();

    // Build query for messages after the last summary
    const query: any = {
      channelId,
      userId,
      agentId,
      status: 'active',
      type: { $in: ['user', 'agent'] },
    };

    if (lastSummary) {
      query.createdAt = { $gt: lastSummary.createdAt };
    }

    // Return messages in chronological order
    return this.model.find(query).sort({ createdAt: 1 }).exec();
  }

  async findLatestByUserAndAgents(
    userId: Types.ObjectId,
    agentIds: Types.ObjectId[],
    channelIds?: Types.ObjectId[],
  ): Promise<Message | null> {
    const query: any = {
      userId,
      status: 'active',
      type: { $in: ['user', 'agent'] },
      agentId: { $in: agentIds },
    };

    if (channelIds && channelIds.length > 0) {
      query.channelId = { $in: channelIds };
    }

    return this.model.findOne(query).sort({ createdAt: -1 }).exec();
  }

  async countTokensInConversation(
    channelId: Types.ObjectId,
    userId: Types.ObjectId,
    agentId: Types.ObjectId,
  ): Promise<number> {
    const messages = await this.findConversationContext(
      channelId,
      userId,
      agentId,
    );

    // Simple token estimation: ~1.3 tokens per word
    // TODO: Replace with proper token counting using tiktoken library for accurate counts
    // This approximation works for most cases but may underestimate for technical content
    const totalWords = messages.reduce((sum, msg) => {
      const words = msg.content.split(/\s+/).length;
      return sum + words;
    }, 0);

    return Math.ceil(totalWords * 1.3);
  }
}
