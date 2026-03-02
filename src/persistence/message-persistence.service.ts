import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { ConversationService } from '@domain/conversation/conversation.service';
import { Conversation } from '@persistence/schemas/conversation.schema';

export interface MessagePersistenceContext {
  channelId: Types.ObjectId | string;
  agentId: Types.ObjectId | string;
  clientId: Types.ObjectId | string;
  contactId: Types.ObjectId | string;
}

@Injectable()
export class MessagePersistenceService {
  private readonly logger = new Logger(MessagePersistenceService.name);
  private static readonly MISSING_IDENTITY_ERROR =
    'Identity must be resolved before message creation';

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationService: ConversationService,
  ) {}

  async resolveConversation(
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
    now: Date = new Date(),
  ): Promise<Conversation> {
    if (!contactId) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    return this.conversationService.resolveOrCreate({
      clientId: new Types.ObjectId(context.clientId),
      contactId,
      channelId: new Types.ObjectId(context.channelId),
      now,
    });
  }

  /**
   * Single entrypoint for creating user messages.
   */
  async createUserMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
    conversationId?: Types.ObjectId,
  ): Promise<void> {
    if (!contactId || !context.contactId) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    const contextContactId = new Types.ObjectId(context.contactId);
    if (!contactId.equals(contextContactId)) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    const now = new Date();
    const conversation = conversationId
      ? ({ _id: conversationId } as Conversation)
      : await this.resolveConversation(context, contactId, now);

    await this.messageRepository.create({
      content,
      type: 'user',
      contactId,
      agentId: new Types.ObjectId(context.agentId),
      clientId: new Types.ObjectId(context.clientId),
      channelId: new Types.ObjectId(context.channelId),
      conversationId: conversation._id,
      status: 'active',
    });

    await this.conversationService.touch(
      conversation._id as Types.ObjectId,
      now,
    );

    this.logger.log(
      `Created user message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
    );
  }

  /**
   * Saves an agent response message to the database
   */
  async saveAgentMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
    conversationId?: Types.ObjectId,
  ): Promise<void> {
    if (!contactId) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    const now = new Date();
    const conversation = conversationId
      ? ({ _id: conversationId } as Conversation)
      : await this.resolveConversation(context, contactId, now);

    await this.messageRepository.create({
      content,
      type: 'agent',
      contactId,
      agentId: new Types.ObjectId(context.agentId),
      clientId: new Types.ObjectId(context.clientId),
      channelId: new Types.ObjectId(context.channelId),
      conversationId: conversation._id,
      status: 'active',
    });

    await this.conversationService.touch(
      conversation._id as Types.ObjectId,
      now,
    );

    this.logger.log(
      `Saved agent message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
    );
  }

  /**
   * Retrieves conversation context (messages since last summary)
   * Returns an array of messages formatted for the agent's conversation history
   */
  async getConversationContextByConversationId(
    conversationId: Types.ObjectId,
    agentId: Types.ObjectId,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await this.messageRepository.findConversationContext(
      conversationId,
      agentId,
    );

    return messages.map((msg) => ({
      role: (msg.type === 'user' ? 'user' : 'assistant') as
        | 'user'
        | 'assistant',
      content: msg.content,
    }));
  }

  /**
   * Complete message persistence flow for outgoing agent responses
   */
  async handleOutgoingMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
    conversationId?: Types.ObjectId,
  ): Promise<void> {
    await this.saveAgentMessage(content, context, contactId, conversationId);
  }
}
