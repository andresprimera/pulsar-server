import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Message } from '@persistence/schemas/message.schema';

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
    if (!data.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const opts = session ? { session } : {};
    const [doc] = await this.model.create([data], opts);
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

  async findByContact(contactId: Types.ObjectId): Promise<Message[]> {
    return this.model.find({ contactId }).sort({ createdAt: 1 }).exec();
  }

  async findByAgent(agentId: Types.ObjectId): Promise<Message[]> {
    return this.model.find({ agentId }).sort({ createdAt: 1 }).exec();
  }

  async findByChannelAndContact(
    channelId: Types.ObjectId,
    contactId: Types.ObjectId,
  ): Promise<Message[]> {
    return this.model
      .find({ channelId, contactId })
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
    conversationId: Types.ObjectId,
    agentId: Types.ObjectId,
  ): Promise<Message[]> {
    // Find the most recent summary for this conversation
    const lastSummary = await this.model
      .findOne({
        conversationId,
        agentId,
        type: 'summary',
        status: 'active',
      })
      .sort({ createdAt: -1 })
      .exec();

    // Build query for messages after the last summary
    const query: any = {
      conversationId,
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

  async findLatestByContactAndAgents(
    contactId: Types.ObjectId,
    agentIds: Types.ObjectId[],
    channelIds?: Types.ObjectId[],
  ): Promise<Message | null> {
    const query: any = {
      contactId,
      status: 'active',
      type: { $in: ['user', 'agent'] },
      agentId: { $in: agentIds },
    };

    if (channelIds && channelIds.length > 0) {
      query.channelId = { $in: channelIds };
    }

    return this.model.findOne(query).sort({ createdAt: -1 }).exec();
  }

  async countMessagesForClientChannel(
    clientId: Types.ObjectId,
    channelId: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    return this.model
      .countDocuments({
        clientId,
        channelId,
        type: 'user',
        status: 'active',
        createdAt: { $gte: periodStart, $lt: periodEnd },
      })
      .exec();
  }

  async countTokensInConversation(
    conversationId: Types.ObjectId,
    agentId: Types.ObjectId,
  ): Promise<number> {
    const messages = await this.findConversationContext(
      conversationId,
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
