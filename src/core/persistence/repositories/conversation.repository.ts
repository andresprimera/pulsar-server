import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
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
