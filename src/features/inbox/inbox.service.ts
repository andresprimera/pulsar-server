import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ContactRepository } from '@persistence/repositories/contact.repository';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { Message } from '@persistence/schemas/message.schema';
import { DEFAULT_CONTROL_MODE, ControlMode } from '@shared/inbox/control-mode';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListConversationsResponseDto } from './dto/list-conversations-response.dto';
import { ListInboxChannelsResponseDto } from './dto/list-inbox-channels-response.dto';
import { ListInboxContactsQueryDto } from './dto/list-inbox-contacts-query.dto';
import { ListInboxContactsResponseDto } from './dto/list-inbox-contacts-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponseDto } from './dto/list-messages-response.dto';
import { UpdateControlModeResponseDto } from './dto/update-control-mode-response.dto';
import { decodeCursor, encodeCursor, PageCursor } from './utils/cursor.util';
import { toInboxMessageDto } from './utils/inbox-message.mapper';
import { toConversationSummary } from './utils/conversation-summary.mapper';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_MESSAGES_LIMIT = 50;
/**
 * Phase 5 — default page size for `GET /inbox/contacts`. The
 * architect-locked contract is 1 ≤ limit ≤ 100, default 50. Lives
 * adjacent to the other list-limit constants so future tuning is
 * mechanically discoverable.
 */
const DEFAULT_CONTACTS_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly userRepository: UserRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly contactRepository: ContactRepository,
  ) {}

  async listConversations(
    clientId: string,
    query: ListConversationsQueryDto,
    actorClientUserId: string,
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
      {
        status,
        cursor,
        limit,
        channelId,
        clientAgentId,
        qLowered,
        actorClientUserId: new Types.ObjectId(actorClientUserId),
      },
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

  /**
   * Phase 5 — `GET /inbox/channels`.
   *
   * Returns the deduped set of channels currently hired by the caller's
   * tenant. Source = `ClientAgent.channels[]` flattened to one row per
   * `(clientAgent, channel)` binding, then deduped by `channelId`. The
   * deduped status is `'active'` when ANY binding on that channel is
   * `'active'`, otherwise `'inactive'` (Decision 6). The `Channel`
   * collection is joined (batched `findByIds`) for the human-readable
   * `label` and the canonical `provider` (= `Channel.type`).
   *
   * Stale references (a hire pointing at a deleted `Channel`) are
   * silently skipped per graceful-degradation (do not throw). No
   * pagination.
   */
  async listChannels(clientId: string): Promise<ListInboxChannelsResponseDto> {
    const hires = await this.clientAgentRepository.findHiredChannelsForClient(
      clientId,
    );

    if (hires.length === 0) {
      return { items: [] };
    }

    // Dedupe by `channelId`. The deduped status is the OR over all
    // bindings: `'active'` if any binding is active, else `'inactive'`.
    const dedupedByChannel = new Map<
      string,
      { channelId: Types.ObjectId; status: 'active' | 'inactive' }
    >();
    for (const hire of hires) {
      const key = String(hire.channelId);
      const existing = dedupedByChannel.get(key);
      if (existing === undefined) {
        dedupedByChannel.set(key, {
          channelId: hire.channelId,
          status: hire.status,
        });
        continue;
      }
      if (existing.status === 'inactive' && hire.status === 'active') {
        existing.status = 'active';
      }
    }

    const channelIds = Array.from(dedupedByChannel.values()).map(
      (v) => v.channelId,
    );
    const channels = await this.channelRepository.findByIds(channelIds);
    const channelMap = new Map(channels.map((c) => [String(c._id), c]));

    const items = [];
    for (const deduped of dedupedByChannel.values()) {
      const channel = channelMap.get(String(deduped.channelId));
      // Graceful degradation: a hire referencing a deleted `Channel`
      // simply drops out of the listing. The join direction is
      // `hire → channel`, so a `Channel` returned by `findByIds` with
      // no surviving hire is impossible by construction (this loop
      // iterates over deduped hires, never over `channels`).
      if (channel === undefined) continue;
      items.push({
        id: String(deduped.channelId),
        provider: channel.type,
        label: channel.name,
        status: deduped.status,
      });
    }

    return { items };
  }

  /**
   * Phase 5 — `GET /inbox/contacts`.
   *
   * Tenant-scoped, cursor-paginated list of contacts projected to the
   * shape the operator inbox UI needs. The cursor encodes
   * `(Contact.updatedAt, Contact._id)` (Phase 1 codec). `limit` is
   * clamped to `[1, 100]` and defaults to {@link DEFAULT_CONTACTS_LIMIT}
   * = 50 per the architect-locked Phase 5 contract.
   *
   * Each row joins:
   *  - `Channel.type` (batched `findByIds`) → wire `provider`. Missing
   *    join → `'unknown'` (the wire forbids `null` on `provider`).
   *  - `Conversation` aggregation (batched
   *    `countConversationsByContacts`) → wire `conversationCount`.
   *    Missing entries → `0`.
   *
   * `email` is `Contact.identifier.value` when
   * `identifier.type === 'email'`, otherwise `null`. `lastSeen` is
   * `Contact.updatedAt`. No `q` filter (deferred to Phase 6+ per
   * Decision 5).
   */
  async listContacts(
    clientId: string,
    query: ListInboxContactsQueryDto,
  ): Promise<ListInboxContactsResponseDto> {
    const cursor = decodeCursor(query.cursor);
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_CONTACTS_LIMIT, 1),
      MAX_LIMIT,
    );

    const page = await this.contactRepository.findInboxContactsPage(
      new Types.ObjectId(clientId),
      { cursor, limit },
    );

    if (page.items.length === 0) {
      return { items: [], nextCursor: null };
    }

    const channelIds = uniqueObjectIds(page.items.map((c) => c.channelId));
    const contactIds = page.items.map((c) => c._id);

    const [channels, countMap] = await Promise.all([
      this.channelRepository.findByIds(channelIds),
      this.conversationRepository.countConversationsByContacts(
        new Types.ObjectId(clientId),
        contactIds,
      ),
    ]);

    const channelMap = new Map(channels.map((c) => [String(c._id), c]));

    const items = page.items.map((contact) => {
      const joinedChannel = channelMap.get(String(contact.channelId));
      const provider = joinedChannel?.type ?? 'unknown';
      const email =
        contact.identifier?.type === 'email' ? contact.identifier.value : null;
      return {
        id: String(contact._id),
        name: contact.name,
        email,
        provider,
        conversationCount: countMap.get(String(contact._id)) ?? 0,
        lastSeen: contact.updatedAt,
      };
    });

    return {
      items,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
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

/**
 * Escapes the regex metacharacters that could let a free-text `q` value
 * compose an unintended pattern. The escaped result is used unanchored
 * (no `^`/`$`) and case-sensitively against the pre-lowercased
 * `contactNameLower` column.
 */
function escapeRegex(value: string): string {
  return value.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
}

/**
 * Stable in-order dedupe of an `ObjectId[]` keyed by hex string. Used
 * to build batched `$in` projections without sending duplicate keys.
 */
function uniqueObjectIds(ids: Types.ObjectId[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

// `PageCursor` is re-exported for spec files that need to construct cursors
// directly without round-tripping through encode/decode.
export type { PageCursor };
