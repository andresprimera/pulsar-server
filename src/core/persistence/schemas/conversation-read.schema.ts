import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Per-operator unread-state record. The document's presence asserts
 * "operator has read this conversation up to `lastReadAt`". Marking a
 * conversation unread is implemented by deleting the row (no sentinel
 * values, no race with `Conversation.lastMessageAt`). Status-agnostic:
 * archived conversations can still carry read records (no cascade-wipe).
 *
 * `clientId` is denormalized for tenant-scoping defense-in-depth — every
 * query filters by `(operatorClientUserId, clientId)` so a session-token
 * swap cannot leak unread state from another tenant.
 */
@Schema({ collection: 'conversation_reads', timestamps: true })
export class ConversationRead extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  operatorClientUserId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  lastReadAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationReadSchema =
  SchemaFactory.createForClass(ConversationRead);

// Business invariant: one read-state record per (conversation × operator).
ConversationReadSchema.index(
  { conversationId: 1, operatorClientUserId: 1 },
  { unique: true, name: 'conv_read_unique' },
);

// Supports the batched lookup `{ operatorClientUserId, conversationId:
// { $in: pageIds } }` performed by `findInboxPageEnriched` to derive the
// per-operator `unread` flag.
ConversationReadSchema.index(
  { operatorClientUserId: 1, conversationId: 1 },
  { name: 'conv_read_by_operator_idx' },
);
