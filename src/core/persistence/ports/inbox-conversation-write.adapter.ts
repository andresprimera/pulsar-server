import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import { InboxConversationWritePort } from '@shared/ports/inbox-conversation-write.port';

/**
 * Persistence-side adapter that satisfies `InboxConversationWritePort`.
 * The domain layer holds only the port symbol; this is the single place
 * the inbox conversation-write surface touches `ConversationRepository`.
 */
@Injectable()
export class InboxConversationWriteAdapter
  implements InboxConversationWritePort
{
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  async updateLastMessageAt(
    conversationId: Types.ObjectId,
    lastMessageAt: Date,
    lastMessagePreview?: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.conversationRepository.updateLastMessageAt(
      conversationId,
      lastMessageAt,
      lastMessagePreview,
      session,
    );
  }

  async setEnrichmentFields(
    conversationId: Types.ObjectId,
    fields: {
      clientAgentId?: Types.ObjectId;
      contactNameLower?: string;
      lastMessagePreview?: string;
    },
  ): Promise<void> {
    await this.conversationRepository.setEnrichmentFields(
      conversationId,
      fields,
    );
  }
}
