import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Conversation } from '@persistence/schemas/conversation.schema';

@Injectable()
export class ConversationRepository {
  constructor(
    @InjectModel(Conversation.name)
    private readonly model: Model<Conversation>,
  ) {}

  async create(
    data: Partial<Conversation>,
    session?: ClientSession,
  ): Promise<Conversation> {
    const opts = session ? { session } : {};
    const [doc] = await this.model.create([data], opts);
    return doc;
  }

  async findLatestOpenByClientContactAndChannel(params: {
    clientId: Types.ObjectId;
    contactId: Types.ObjectId;
    channelId: Types.ObjectId;
  }): Promise<Conversation | null> {
    return this.model
      .findOne({
        clientId: params.clientId,
        contactId: params.contactId,
        channelId: params.channelId,
        status: 'open',
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async updateStatus(
    id: Types.ObjectId,
    status: 'open' | 'closed' | 'archived',
    session?: ClientSession,
  ): Promise<Conversation | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { status },
        { new: true, ...(session && { session }) },
      )
      .exec();
  }

  async updateLastMessageAt(
    id: Types.ObjectId,
    lastMessageAt: Date,
    session?: ClientSession,
  ): Promise<Conversation | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { lastMessageAt },
        { new: true, ...(session && { session }) },
      )
      .exec();
  }
}
