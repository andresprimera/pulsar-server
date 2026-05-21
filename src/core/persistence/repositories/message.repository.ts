import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Message } from '@persistence/schemas/message.schema';

export interface InboxThreadCursor {
  t: Date;
  i: Types.ObjectId;
}

export interface InboxThreadPageResult {
  items: Message[];
  nextCursor: InboxThreadCursor | null;
}

/**
 * Marker error raised by `MessageRepository.createOperatorMessage` when a
 * Mongo `E11000` is observed against the partial-unique
 * `(conversationId, idempotencyKey)` index. Service callers translate this
 * to a replay short-circuit (re-read via `findByIdempotencyKey`).
 *
 * Kept as a typed marker rather than a generic Error so the caller can
 * `instanceof`-check without inspecting Mongo's driver internals.
 */
export class MessageIdempotencyConflictError extends Error {
  constructor(
    message = 'Idempotency conflict on (conversationId, idempotencyKey)',
  ) {
    super(message);
    this.name = 'MessageIdempotencyConflictError';
  }
}

interface MongoDuplicateKeyError {
  code?: number;
  message?: string;
}

function isDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MongoDuplicateKeyError).code === 11000
  );
}

/**
 * Input shape for `createOperatorMessage`. Mirrors the persistence-level
 * fields a feature-layer service needs to set when an operator submits a
 * tenant-driven outbound text reply.
 */
export interface CreateOperatorMessageInput {
  conversationId: Types.ObjectId;
  clientId: Types.ObjectId;
  channelId: Types.ObjectId;
  authorClientUserId: Types.ObjectId;
  content: string;
  idempotencyKey: string;
}

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

  /**
   * Paginated chronological read of a conversation's message thread for
   * the inbox UI. Filters out `summary` (operator view never sees
   * compression markers) and inactive messages. Includes Phase-2
   * operator-authored (`type === 'human'`) rows in the page. Cursor
   * pagination on `(createdAt, _id)` ascending. The caller MUST verify
   * conversation ownership before invoking this method.
   */
  async findByConversationPage(
    conversationId: Types.ObjectId,
    opts: {
      cursor: InboxThreadCursor | null;
      limit: number;
    },
  ): Promise<InboxThreadPageResult> {
    const filter: Record<string, unknown> = {
      conversationId,
      status: 'active',
      type: { $in: ['user', 'agent', 'human'] },
    };
    if (opts.cursor) {
      filter.$or = [
        { createdAt: { $gt: opts.cursor.t } },
        { createdAt: opts.cursor.t, _id: { $gt: opts.cursor.i } },
      ];
    }

    const rows = (await this.model
      .find(filter, {
        _id: 1,
        content: 1,
        type: 1,
        contactId: 1,
        agentId: 1,
        authorClientUserId: 1,
        deliveryStatus: 1,
        conversationId: 1,
        createdAt: 1,
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(opts.limit + 1)
      .lean()
      .exec()) as Message[];

    if (rows.length <= opts.limit) {
      return { items: rows, nextCursor: null };
    }

    const items = rows.slice(0, opts.limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: {
        t: last.createdAt as Date,
        i: last._id as Types.ObjectId,
      },
    };
  }

  /**
   * Inserts an operator-authored outbound row with `type: 'human'` and
   * `deliveryStatus: 'pending'`. On `E11000` against the partial-unique
   * `(conversationId, idempotencyKey)` index, this method throws a typed
   * `MessageIdempotencyConflictError` so the caller can re-read the prior
   * row via `findByIdempotencyKey` and skip downstream dispatch.
   */
  async createOperatorMessage(
    input: CreateOperatorMessageInput,
    session?: ClientSession,
  ): Promise<Message> {
    const payload: Partial<Message> = {
      conversationId: input.conversationId,
      clientId: input.clientId,
      channelId: input.channelId,
      authorClientUserId: input.authorClientUserId,
      content: input.content,
      type: 'human',
      status: 'active',
      deliveryStatus: 'pending',
      idempotencyKey: input.idempotencyKey,
    };

    const opts = session ? { session } : {};
    try {
      const [doc] = await this.model.create([payload], opts);
      return doc;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new MessageIdempotencyConflictError();
      }
      throw error;
    }
  }

  /**
   * Returns the prior operator-authored row for `(conversationId,
   * idempotencyKey)` if one exists, else `null`. Used by the operator
   * outbound flow for both the cheap-path replay short-circuit (before
   * insert) and the race-recovery branch (after `E11000`).
   */
  async findByIdempotencyKey(
    conversationId: Types.ObjectId,
    idempotencyKey: string,
  ): Promise<Message | null> {
    return this.model
      .findOne({ conversationId, idempotencyKey })
      .lean()
      .exec() as unknown as Promise<Message | null>;
  }

  /**
   * Sets `deliveryStatus` on an operator-authored row. The Phase-2 flow
   * calls this once per send with the terminal value (`'sent'` or
   * `'failed'`). No transition guard — this seam is intentionally simple
   * so the calling service owns the state machine.
   */
  async updateDeliveryStatus(
    messageId: Types.ObjectId,
    deliveryStatus: 'pending' | 'sent' | 'failed',
  ): Promise<Message | null> {
    return this.model
      .findByIdAndUpdate(messageId, { $set: { deliveryStatus } }, { new: true })
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
