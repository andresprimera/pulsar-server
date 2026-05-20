import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Agent } from '@persistence/schemas/agent.schema';
import { Channel } from '@persistence/schemas/channel.schema';
import {
  ClientAgent,
  HireChannelConfig,
} from '@persistence/schemas/client-agent.schema';
import { Contact } from '@persistence/schemas/contact.schema';
import { Conversation } from '@persistence/schemas/conversation.schema';
import { ControlMode } from '@shared/inbox/control-mode';

export interface InboxListCursor {
  t: Date;
  i: Types.ObjectId;
}

export interface InboxListPageResult {
  items: Conversation[];
  nextCursor: InboxListCursor | null;
}

/**
 * Wire-adjacent row returned by `findInboxPageEnriched`. Carries the base
 * conversation projection plus the joined columns the inbox list DTO
 * needs (contact name/identifier, channel type, hired-agent name, hire
 * channel handle). Service maps this to `ConversationSummaryDto`.
 */
export interface EnrichedInboxRow {
  _id: Types.ObjectId;
  clientId: Types.ObjectId;
  contactId: Types.ObjectId;
  channelId: Types.ObjectId;
  clientAgentId?: Types.ObjectId;
  status: 'open' | 'closed' | 'archived';
  controlMode?: ControlMode;
  lastMessageAt: Date;
  lastMessagePreview?: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
  contact: {
    name?: string;
    identifier?: {
      type: 'phone' | 'username' | 'platform_id' | 'email';
      value: string;
    };
  } | null;
  channel: { type?: string } | null;
  clientAgent: {
    agentId?: string;
    channels?: Array<{
      channelId?: Types.ObjectId;
      phoneNumberId?: string;
      instagramAccountId?: string;
      tiktokUserId?: string;
      telegramBotId?: string;
    }>;
  } | null;
  agent: { name?: string } | null;
}

export interface EnrichedInboxPageResult {
  items: EnrichedInboxRow[];
  nextCursor: InboxListCursor | null;
}

@Injectable()
export class ConversationRepository {
  constructor(
    @InjectModel(Conversation.name)
    private readonly model: Model<Conversation>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<Contact>,
    @InjectModel(Channel.name)
    private readonly channelModel: Model<Channel>,
    @InjectModel(ClientAgent.name)
    private readonly clientAgentModel: Model<ClientAgent>,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
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

  /**
   * Atomically advances `lastMessageAt` and, when supplied, denormalizes
   * a server-truncated (≤ 280 char) `lastMessagePreview` in the same
   * `$set`. Callers MUST NOT invoke this on the orchestrator's human-mode
   * skip path — suppression is owned upstream.
   */
  async updateLastMessageAt(
    id: Types.ObjectId,
    lastMessageAt: Date,
    lastMessagePreview?: string,
    session?: ClientSession,
  ): Promise<Conversation | null> {
    const update: Record<string, unknown> = { lastMessageAt };
    if (lastMessagePreview !== undefined) {
      update.lastMessagePreview = lastMessagePreview.slice(0, 280);
    }
    return this.model
      .findByIdAndUpdate(id, update, {
        new: true,
        ...(session && { session }),
      })
      .exec();
  }

  /**
   * Idempotent setter for the denormalized inbox-list enrichment columns.
   * Used by `InboxConversationEnrichmentBackfillMigration`; applies `$set`
   * with only the supplied fields and server-truncates
   * `lastMessagePreview` to 280 characters.
   */
  async setEnrichmentFields(
    conversationId: Types.ObjectId,
    fields: {
      clientAgentId?: Types.ObjectId;
      contactNameLower?: string;
      lastMessagePreview?: string;
    },
  ): Promise<void> {
    const $set: Record<string, unknown> = {};
    if (fields.clientAgentId !== undefined) {
      $set.clientAgentId = fields.clientAgentId;
    }
    if (fields.contactNameLower !== undefined) {
      $set.contactNameLower = fields.contactNameLower;
    }
    if (fields.lastMessagePreview !== undefined) {
      $set.lastMessagePreview = fields.lastMessagePreview.slice(0, 280);
    }
    if (Object.keys($set).length === 0) return;
    await this.model.updateOne({ _id: conversationId }, { $set }).exec();
  }

  /**
   * Tenant-scoped paginated read of inbox conversations.
   *
   * Filter: `{ clientId, status }`. Cursor predicate (when provided) on
   * `(lastMessageAt, _id)` to keep pagination stable under same-millisecond
   * ties. Sort matches the `inbox_list_idx` compound index. Uses
   * `.lean().exec()` and projects only the fields the inbox list DTO needs.
   */
  async findInboxPage(
    clientId: Types.ObjectId,
    opts: {
      status: 'open' | 'closed' | 'archived';
      cursor: InboxListCursor | null;
      limit: number;
    },
  ): Promise<InboxListPageResult> {
    const filter: Record<string, unknown> = {
      clientId,
      status: opts.status,
    };
    if (opts.cursor) {
      filter.$or = [
        { lastMessageAt: { $lt: opts.cursor.t } },
        { lastMessageAt: opts.cursor.t, _id: { $lt: opts.cursor.i } },
      ];
    }

    const rows = (await this.model
      .find(filter, {
        _id: 1,
        clientId: 1,
        contactId: 1,
        channelId: 1,
        status: 1,
        controlMode: 1,
        lastMessageAt: 1,
        summary: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(opts.limit + 1)
      .lean()
      .exec()) as Conversation[];

    if (rows.length <= opts.limit) {
      return { items: rows, nextCursor: null };
    }

    const items = rows.slice(0, opts.limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: {
        t: last.lastMessageAt,
        i: last._id as Types.ObjectId,
      },
    };
  }

  /**
   * Tenant-scoped paginated inbox read with denormalized joins for
   * contact, channel, hired-agent (`ClientAgent`), and agent name.
   *
   * Pins `inbox_list_agent_idx` when `clientAgentId` is supplied (the
   * filter prefix matches the compound), otherwise pins `inbox_list_idx`.
   * The `qLowered` filter is applied as a residual case-insensitive
   * substring match on the pre-lowercased `contactNameLower` column;
   * the planner narrows to the page first (`O(limit)` rows scanned).
   *
   * Joins use four batched `$in` projections in parallel:
   *   - Contact      → `{ name, identifier }`
   *   - Channel      → `{ type }`
   *   - ClientAgent  → `{ agentId, channels }`
   *   - Agent        → `{ name }` (keyed by the ClientAgent's `agentId`)
   *
   * Missing references map to `null` per row; the service is responsible
   * for projecting the wire defaults (`""`, `null`).
   */
  async findInboxPageEnriched(
    clientId: Types.ObjectId,
    opts: {
      status: 'open' | 'closed' | 'archived';
      cursor: InboxListCursor | null;
      limit: number;
      channelId?: Types.ObjectId;
      clientAgentId?: Types.ObjectId;
      qLowered?: string;
    },
  ): Promise<EnrichedInboxPageResult> {
    const filter: Record<string, unknown> = {
      clientId,
      status: opts.status,
    };
    if (opts.channelId !== undefined) {
      filter.channelId = opts.channelId;
    }
    if (opts.clientAgentId !== undefined) {
      filter.clientAgentId = opts.clientAgentId;
    }
    if (opts.qLowered !== undefined && opts.qLowered.length > 0) {
      filter.contactNameLower = { $regex: opts.qLowered };
    }
    if (opts.cursor) {
      filter.$or = [
        { lastMessageAt: { $lt: opts.cursor.t } },
        { lastMessageAt: opts.cursor.t, _id: { $lt: opts.cursor.i } },
      ];
    }

    const hint =
      opts.clientAgentId !== undefined
        ? 'inbox_list_agent_idx'
        : 'inbox_list_idx';

    const rows = (await this.model
      .find(filter, {
        _id: 1,
        clientId: 1,
        contactId: 1,
        channelId: 1,
        clientAgentId: 1,
        status: 1,
        controlMode: 1,
        lastMessageAt: 1,
        lastMessagePreview: 1,
        summary: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(opts.limit + 1)
      .hint(hint)
      .lean()
      .exec()) as Array<{
      _id: Types.ObjectId;
      clientId: Types.ObjectId;
      contactId: Types.ObjectId;
      channelId: Types.ObjectId;
      clientAgentId?: Types.ObjectId;
      status: 'open' | 'closed' | 'archived';
      controlMode?: ControlMode;
      lastMessageAt: Date;
      lastMessagePreview?: string;
      summary?: string;
      createdAt: Date;
      updatedAt: Date;
    }>;

    const hasMore = rows.length > opts.limit;
    const baseRows = hasMore ? rows.slice(0, opts.limit) : rows;

    if (baseRows.length === 0) {
      return { items: [], nextCursor: null };
    }

    const contactIds = uniqueObjectIds(baseRows.map((r) => r.contactId));
    const channelIds = uniqueObjectIds(baseRows.map((r) => r.channelId));
    const clientAgentIds = uniqueObjectIds(
      baseRows
        .map((r) => r.clientAgentId)
        .filter((id): id is Types.ObjectId => id !== undefined && id !== null),
    );

    const [contacts, channels, clientAgents] = await Promise.all([
      contactIds.length > 0
        ? (this.contactModel
            .find(
              { _id: { $in: contactIds } },
              { _id: 1, name: 1, identifier: 1 },
            )
            .lean()
            .exec() as unknown as Promise<
            Array<{
              _id: Types.ObjectId;
              name?: string;
              identifier?: Contact['identifier'];
            }>
          >)
        : Promise.resolve([]),
      channelIds.length > 0
        ? (this.channelModel
            .find({ _id: { $in: channelIds } }, { _id: 1, type: 1 })
            .lean()
            .exec() as unknown as Promise<
            Array<{ _id: Types.ObjectId; type?: string }>
          >)
        : Promise.resolve([]),
      clientAgentIds.length > 0
        ? (this.clientAgentModel
            .find(
              { _id: { $in: clientAgentIds } },
              { _id: 1, agentId: 1, channels: 1 },
            )
            .lean()
            .exec() as unknown as Promise<
            Array<{
              _id: Types.ObjectId;
              agentId?: string;
              channels?: HireChannelConfig[];
            }>
          >)
        : Promise.resolve([]),
    ]);

    const agentIdStrings = uniqueStrings(
      clientAgents
        .map((ca) => ca.agentId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    const agentObjectIds = agentIdStrings
      .filter((s) => Types.ObjectId.isValid(s))
      .map((s) => new Types.ObjectId(s));

    const agents =
      agentObjectIds.length > 0
        ? ((await this.agentModel
            .find({ _id: { $in: agentObjectIds } }, { _id: 1, name: 1 })
            .lean()
            .exec()) as unknown as Array<{
            _id: Types.ObjectId;
            name?: string;
          }>)
        : [];

    const contactMap = new Map(contacts.map((c) => [String(c._id), c]));
    const channelMap = new Map(channels.map((c) => [String(c._id), c]));
    const clientAgentMap = new Map(
      clientAgents.map((ca) => [String(ca._id), ca]),
    );
    const agentMap = new Map(agents.map((a) => [String(a._id), a]));

    const items: EnrichedInboxRow[] = baseRows.map((row) => {
      const ca = row.clientAgentId
        ? clientAgentMap.get(String(row.clientAgentId)) ?? null
        : null;
      const agent =
        ca && ca.agentId ? agentMap.get(String(ca.agentId)) ?? null : null;
      return {
        _id: row._id,
        clientId: row.clientId,
        contactId: row.contactId,
        channelId: row.channelId,
        clientAgentId: row.clientAgentId,
        status: row.status,
        controlMode: row.controlMode,
        lastMessageAt: row.lastMessageAt,
        lastMessagePreview: row.lastMessagePreview,
        summary: row.summary,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        contact: contactMap.get(String(row.contactId)) ?? null,
        channel: channelMap.get(String(row.channelId)) ?? null,
        clientAgent: ca,
        agent,
      };
    });

    if (!hasMore) {
      return { items, nextCursor: null };
    }

    const last = items[items.length - 1];
    return {
      items,
      nextCursor: { t: last.lastMessageAt, i: last._id },
    };
  }

  /**
   * Tenant-scoped single-document lookup used by the inbox controller to
   * verify ownership before reading messages or accepting a control-mode
   * write. Returns `null` on both not-found and cross-tenant access, which
   * the caller maps to `NotFoundException` to avoid existence leaks.
   */
  async findByIdForClient(
    conversationId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Conversation | null> {
    return this.model
      .findOne({ _id: conversationId, clientId })
      .lean()
      .exec() as unknown as Promise<Conversation | null>;
  }

  /**
   * Atomic tenant-scoped control-mode update.
   *
   * `runValidators: true` enforces the schema enum on the update path
   * (Mongoose otherwise skips enum validation on `findOneAndUpdate`).
   * Returns `null` when the conversation is missing or owned by a
   * different tenant — caller maps to `NotFoundException`.
   */
  async updateControlMode(
    conversationId: Types.ObjectId,
    clientId: Types.ObjectId,
    controlMode: ControlMode,
  ): Promise<Conversation | null> {
    return this.model
      .findOneAndUpdate(
        { _id: conversationId, clientId },
        { $set: { controlMode } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec() as unknown as Promise<Conversation | null>;
  }
}

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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
