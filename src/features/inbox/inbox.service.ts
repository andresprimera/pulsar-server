import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { Conversation } from '@persistence/schemas/conversation.schema';
import { Message } from '@persistence/schemas/message.schema';
import { DEFAULT_CONTROL_MODE, ControlMode } from '@shared/inbox/control-mode';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import { InboxMessageDto } from './dto/inbox-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListConversationsResponseDto } from './dto/list-conversations-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponseDto } from './dto/list-messages-response.dto';
import { UpdateControlModeResponseDto } from './dto/update-control-mode-response.dto';
import { decodeCursor, encodeCursor, PageCursor } from './utils/cursor.util';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async listConversations(
    clientId: string,
    query: ListConversationsQueryDto,
  ): Promise<ListConversationsResponseDto> {
    const cursor = decodeCursor(query.cursor);
    const limit = Math.min(query.limit ?? DEFAULT_LIST_LIMIT, MAX_LIMIT);
    const status = query.status ?? 'open';

    const page = await this.conversationRepository.findInboxPage(
      new Types.ObjectId(clientId),
      { status, cursor, limit },
    );

    return {
      items: page.items.map(toConversationSummary),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  async listConversationMessages(
    clientId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<ListMessagesResponseDto> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const clientObjectId = new Types.ObjectId(clientId);

    const owned = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!owned) {
      throw new NotFoundException('Conversation not found');
    }

    const cursor = decodeCursor(query.cursor);
    const limit = Math.min(query.limit ?? DEFAULT_MESSAGES_LIMIT, MAX_LIMIT);

    const page = await this.messageRepository.findByConversationPage(
      conversationObjectId,
      { cursor, limit },
    );

    return {
      items: page.items.map(toInboxMessage),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      conversationId,
    };
  }

  async updateControlMode(
    clientId: string,
    conversationId: string,
    controlMode: ControlMode,
    actorClientUserId: string,
  ): Promise<UpdateControlModeResponseDto> {
    const updated = await this.conversationRepository.updateControlMode(
      new Types.ObjectId(conversationId),
      new Types.ObjectId(clientId),
      controlMode,
    );
    if (!updated) {
      throw new NotFoundException('Conversation not found');
    }

    this.logger.log(
      `event=inbox.controlMode.changed conversationId=${String(
        updated._id,
      )} clientId=${clientId} actorClientUserId=${actorClientUserId} controlMode=${
        updated.controlMode ?? DEFAULT_CONTROL_MODE
      }`,
    );

    return {
      conversationId: String(updated._id),
      controlMode: (updated.controlMode ?? DEFAULT_CONTROL_MODE) as ControlMode,
      updatedAt: updated.updatedAt,
    };
  }
}

function toConversationSummary(doc: Conversation): ConversationSummaryDto {
  return {
    _id: String(doc._id),
    contactId: String(doc.contactId),
    channelId: String(doc.channelId),
    status: doc.status,
    controlMode: (doc.controlMode ?? DEFAULT_CONTROL_MODE) as ControlMode,
    lastMessageAt: doc.lastMessageAt,
    summary: doc.summary,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toInboxMessage(doc: Message): InboxMessageDto {
  return {
    _id: String(doc._id),
    conversationId: String(doc.conversationId),
    content: doc.content,
    type: doc.type as 'user' | 'agent',
    contactId: doc.contactId ? String(doc.contactId) : null,
    agentId: doc.agentId ? String(doc.agentId) : null,
    createdAt: doc.createdAt as Date,
  };
}

// `PageCursor` is re-exported for spec files that need to construct cursors
// directly without round-tripping through encode/decode.
export type { PageCursor };
