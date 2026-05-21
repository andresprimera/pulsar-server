import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import {
  ConversationRepository,
  EnrichedInboxRow,
} from '@persistence/repositories/conversation.repository';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { Message } from '@persistence/schemas/message.schema';
import { DEFAULT_CONTROL_MODE, ControlMode } from '@shared/inbox/control-mode';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListConversationsResponseDto } from './dto/list-conversations-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponseDto } from './dto/list-messages-response.dto';
import { UpdateControlModeResponseDto } from './dto/update-control-mode-response.dto';
import { decodeCursor, encodeCursor, PageCursor } from './utils/cursor.util';
import { toInboxMessageDto } from './utils/inbox-message.mapper';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async listConversations(
    clientId: string,
    query: ListConversationsQueryDto,
  ): Promise<ListConversationsResponseDto> {
    const cursor = decodeCursor(query.cursor);
    const limit = Math.min(query.limit ?? DEFAULT_LIST_LIMIT, MAX_LIMIT);
    const status = query.status ?? 'open';

    const channelId =
      query.channelId !== undefined
        ? new Types.ObjectId(query.channelId)
        : undefined;

    let clientAgentId: Types.ObjectId | undefined;
    if (query.agentId !== undefined) {
      const hire = await this.clientAgentRepository.findByClientAndAgent(
        clientId,
        query.agentId,
      );
      if (!hire) {
        return { items: [], nextCursor: null };
      }
      clientAgentId = hire._id as Types.ObjectId;
    }

    const qLowered =
      query.q !== undefined && query.q.length > 0
        ? escapeRegex(query.q.trim().toLowerCase())
        : undefined;

    const page = await this.conversationRepository.findInboxPageEnriched(
      new Types.ObjectId(clientId),
      { status, cursor, limit, channelId, clientAgentId, qLowered },
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

    const authorNamesByUserId = await this.resolveAuthorNames(page.items);

    return {
      items: page.items.map((m) => toInboxMessageDto(m, authorNamesByUserId)),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      conversationId,
    };
  }

  /**
   * Batched `User._id → name` lookup for the operator-authored rows on a
   * page. Mirrors Phase 1's enrichment pattern (single `find`, no N+1).
   * Returns an empty map when no `'human'` rows are present.
   */
  private async resolveAuthorNames(
    messages: Message[],
  ): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.authorClientUserId) {
        ids.add(String(m.authorClientUserId));
      }
    }
    if (ids.size === 0) {
      return new Map();
    }
    const users = await this.userRepository.findByIds(
      Array.from(ids).map((id) => new Types.ObjectId(id)),
    );
    const out = new Map<string, string>();
    for (const u of users) {
      out.set(String(u._id), u.name);
    }
    return out;
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

function toConversationSummary(row: EnrichedInboxRow): ConversationSummaryDto {
  const contactName = row.contact?.name ?? '';
  const contactEmail =
    row.contact?.identifier?.type === 'email'
      ? row.contact.identifier.value
      : null;
  const provider = (row.channel?.type ?? '').toLowerCase();
  const channelHandle = resolveChannelHandle(row);
  const assistant = row.agent?.name ?? null;

  return {
    _id: String(row._id),
    contactId: String(row.contactId),
    channelId: String(row.channelId),
    status: row.status,
    controlMode: (row.controlMode ?? DEFAULT_CONTROL_MODE) as ControlMode,
    lastMessageAt: row.lastMessageAt,
    summary: row.summary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contactName,
    contactEmail,
    provider,
    channelHandle,
    assistant,
    assignedOperatorName: null,
    lastMessagePreview: row.lastMessagePreview ?? '',
    unreadCount: 0,
    tags: [],
  };
}

function resolveChannelHandle(row: EnrichedInboxRow): string {
  const hireChannels = row.clientAgent?.channels ?? [];
  const matching = hireChannels.find(
    (c) => c.channelId && String(c.channelId) === String(row.channelId),
  );
  if (!matching) return '';
  return (
    matching.phoneNumberId ??
    matching.instagramAccountId ??
    matching.tiktokUserId ??
    matching.telegramBotId ??
    ''
  );
}

/**
 * Escapes the regex metacharacters that could let a free-text `q` value
 * compose an unintended pattern. The escaped result is used unanchored
 * (no `^`/`$`) and case-sensitively against the pre-lowercased
 * `contactNameLower` column.
 */
function escapeRegex(value: string): string {
  return value.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
}

// `PageCursor` is re-exported for spec files that need to construct cursors
// directly without round-tripping through encode/decode.
export type { PageCursor };
