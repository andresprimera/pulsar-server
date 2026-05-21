import { Inject, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
// eslint-disable-next-line boundaries/element-types -- TODO: domain→persistence violation, tracked for refactor
import { Conversation } from '@persistence/schemas/conversation.schema';
// eslint-disable-next-line boundaries/element-types -- TODO: domain→persistence violation, tracked for refactor
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import {
  INBOX_CONVERSATION_WRITE_PORT,
  InboxConversationWritePort,
} from '@shared/ports/inbox-conversation-write.port';
import { WHATSAPP_CONVERSATION_TIMEOUT_MS } from './conversation.constants';

interface MongoDuplicateKeyError {
  code?: number;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    @Inject(INBOX_CONVERSATION_WRITE_PORT)
    private readonly inboxWritePort: InboxConversationWritePort,
  ) {}

  async resolveOrCreate(params: {
    clientId: Types.ObjectId;
    contactId: Types.ObjectId;
    channelId: Types.ObjectId;
    now: Date;
  }): Promise<Conversation> {
    const lookupParams = {
      clientId: params.clientId,
      contactId: params.contactId,
      channelId: params.channelId,
    };

    const existingOpenConversation =
      await this.conversationRepository.findLatestOpenByClientContactAndChannel(
        lookupParams,
      );

    if (
      !existingOpenConversation ||
      existingOpenConversation.status !== 'open'
    ) {
      return this.createOpenConversationWithDuplicateRecovery(
        params,
        lookupParams,
      );
    }

    const elapsed =
      params.now.getTime() -
      new Date(existingOpenConversation.lastMessageAt).getTime();

    if (elapsed < WHATSAPP_CONVERSATION_TIMEOUT_MS) {
      return existingOpenConversation;
    }

    await this.conversationRepository.updateStatus(
      existingOpenConversation._id as Types.ObjectId,
      'closed',
    );

    return this.createOpenConversationWithDuplicateRecovery(
      params,
      lookupParams,
    );
  }

  async touch(
    conversationId: Types.ObjectId,
    now: Date = new Date(),
    lastMessagePreview?: string,
  ): Promise<void> {
    await this.inboxWritePort.updateLastMessageAt(
      conversationId,
      now,
      lastMessagePreview,
    );
  }

  private async createOpenConversation(params: {
    clientId: Types.ObjectId;
    contactId: Types.ObjectId;
    channelId: Types.ObjectId;
    now: Date;
  }): Promise<Conversation> {
    return this.conversationRepository.create({
      clientId: params.clientId,
      contactId: params.contactId,
      channelId: params.channelId,
      status: 'open',
      lastMessageAt: params.now,
    });
  }

  private async createOpenConversationWithDuplicateRecovery(
    createParams: {
      clientId: Types.ObjectId;
      contactId: Types.ObjectId;
      channelId: Types.ObjectId;
      now: Date;
    },
    lookupParams: {
      clientId: Types.ObjectId;
      contactId: Types.ObjectId;
      channelId: Types.ObjectId;
    },
  ): Promise<Conversation> {
    try {
      return await this.createOpenConversation(createParams);
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      const createdByAnotherRequest =
        await this.conversationRepository.findLatestOpenByClientContactAndChannel(
          lookupParams,
        );

      if (createdByAnotherRequest) {
        return createdByAnotherRequest;
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as MongoDuplicateKeyError).code === 11000
    );
  }
}
