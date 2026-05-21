import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationRead } from '@persistence/schemas/conversation-read.schema';

/**
 * Tenant-scoped persistence for the per-operator unread state of an
 * inbox conversation. Every read/write filters by `clientId` so a
 * cross-tenant query can never surface another tenant's read state.
 *
 * Note: read/unread mutations are deliberately status-agnostic — they
 * are allowed on archived conversations (no cascade-wipe on archive).
 */
@Injectable()
export class ConversationReadRepository {
  constructor(
    @InjectModel(ConversationRead.name)
    private readonly model: Model<ConversationRead>,
  ) {}

  /**
   * Upsert by the unique compound `(conversationId, operatorClientUserId)`
   * and atomically advance `lastReadAt`. `clientId` is set on both insert
   * and update for tenant-scoping defense-in-depth. Returns the upserted
   * document.
   */
  async markRead(input: {
    conversationId: Types.ObjectId;
    operatorClientUserId: Types.ObjectId;
    clientId: Types.ObjectId;
    lastReadAt: Date;
  }): Promise<ConversationRead> {
    const doc = await this.model
      .findOneAndUpdate(
        {
          conversationId: input.conversationId,
          operatorClientUserId: input.operatorClientUserId,
        },
        {
          $set: {
            lastReadAt: input.lastReadAt,
            clientId: input.clientId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    // `upsert: true` + `new: true` guarantees a document; the typings
    // still allow null for the non-upsert overload, hence the cast.
    return doc as ConversationRead;
  }

  /**
   * Idempotent delete by the unique tuple. Filters by `clientId` so a
   * stray cross-tenant request cannot delete another tenant's row.
   * Missing → no-op.
   */
  async markUnread(input: {
    conversationId: Types.ObjectId;
    operatorClientUserId: Types.ObjectId;
    clientId: Types.ObjectId;
  }): Promise<void> {
    await this.model
      .deleteOne({
        conversationId: input.conversationId,
        operatorClientUserId: input.operatorClientUserId,
        clientId: input.clientId,
      })
      .exec();
  }

  /**
   * Single batched `$in` lookup that returns the operator's read-state
   * rows for the supplied conversation ids. Tenant-filtered. Used by
   * `findInboxPageEnriched` to derive the per-row `unread` flag without
   * an N+1 read. Returns an empty array on empty input.
   */
  async findByConversationsForOperator(
    conversationIds: Types.ObjectId[],
    operatorClientUserId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<Array<{ conversationId: Types.ObjectId; lastReadAt: Date }>> {
    if (conversationIds.length === 0) return [];
    return this.model
      .find(
        {
          operatorClientUserId,
          clientId,
          conversationId: { $in: conversationIds },
        },
        { conversationId: 1, lastReadAt: 1 },
      )
      .lean()
      .exec() as unknown as Array<{
      conversationId: Types.ObjectId;
      lastReadAt: Date;
    }>;
  }
}
