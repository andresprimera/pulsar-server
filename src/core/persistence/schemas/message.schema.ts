import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'messages', timestamps: true })
export class Message extends Document {
  @Prop({ required: true })
  content: string;

  /**
   * Discriminator for the message author kind. Forward-only enum — once a
   * value has been shipped it MUST NOT be removed (see
   * `docs/rules/data-modeling.md`). Phase 2 widens the enum with `'human'`
   * for operator-authored outbound rows. Existing inbound (`'user'`),
   * agent-authored (`'agent'`), and compression (`'summary'`) values are
   * unchanged.
   */
  @Prop({
    required: true,
    enum: ['user', 'agent', 'summary', 'human'],
    index: true,
  })
  type: 'user' | 'agent' | 'summary' | 'human';

  @Prop({
    type: Types.ObjectId,
    ref: 'Contact',
    required: function (this: Message) {
      return this.type === 'user';
    },
    index: true,
  })
  contactId?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Agent',
    index: true,
  })
  agentId?: Types.ObjectId;

  /**
   * Author client user identity for operator-authored (`type === 'human'`)
   * rows. Required when `type === 'human'` (enforced by `pre('validate')`
   * and `pre('findOneAndUpdate')` hooks below). Optional otherwise.
   * Indexed to support future operator-activity dashboards.
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
  })
  authorClientUserId?: Types.ObjectId;

  /**
   * Transport delivery status for operator-authored outbound rows.
   * Separate from `status` (lifecycle/visibility) by design: mixing the
   * two would break inbox-read filters that rely on `status: 'active'`.
   * Forward-only enum.
   */
  @Prop({
    type: String,
    required: false,
    enum: ['pending', 'sent', 'failed'],
  })
  deliveryStatus?: 'pending' | 'sent' | 'failed';

  /**
   * Per-conversation idempotency key supplied by the caller of the
   * operator-send endpoint (UUID v4). The partial-unique compound index
   * `(conversationId, idempotencyKey)` declared below is the SOLE
   * idempotency primitive for operator outbound — `processed_events` is
   * not touched on this write path.
   */
  @Prop({ type: String, required: false })
  idempotencyKey?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Channel',
    required: true,
    index: true,
  })
  channelId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({
  clientId: 1,
  channelId: 1,
  type: 1,
  status: 1,
  createdAt: 1,
});

// Covers `MessageRepository.findByConversationPage` (inbox thread reads):
// filter `{ conversationId, status: 'active', type: { $in: ['user','agent','human'] } }`,
// sort `{ createdAt: 1, _id: 1 }` with `(createdAt, _id)` keyset cursor.
MessageSchema.index(
  {
    conversationId: 1,
    status: 1,
    type: 1,
    createdAt: 1,
    _id: 1,
  },
  { name: 'inbox_thread_idx' },
);

// SOLE operator-outbound idempotency primitive (Phase 2). Partial filter
// keeps Phase-1 rows (no `idempotencyKey`) out of the index — only
// operator-authored rows participate. Per-conversation scope: the same
// key on a different conversation is a new request.
MessageSchema.index(
  { conversationId: 1, idempotencyKey: 1 },
  {
    name: 'message_idempotency_key_idx',
    unique: true,
    partialFilterExpression: { idempotencyKey: { $exists: true } },
  },
);

// Validation: user messages must have contactId, agent/summary messages must have agentId,
// human messages must have authorClientUserId.
MessageSchema.pre('validate', function (next) {
  if (this.type === 'user' && !this.contactId) {
    next(new Error('contactId is required for user messages'));
    return;
  }

  if ((this.type === 'agent' || this.type === 'summary') && !this.agentId) {
    next(new Error('agentId is required for agent and summary messages'));
    return;
  }

  if (this.type === 'human' && !this.authorClientUserId) {
    next(new Error('authorClientUserId is required for human messages'));
    return;
  }

  next();
});

// Validation for updates
MessageSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  const updatePayload = update?.$set ? { ...update.$set } : { ...update };
  const type = updatePayload.type;
  const contactId = updatePayload.contactId;
  const agentId = updatePayload.agentId;
  const authorClientUserId = updatePayload.authorClientUserId;

  if (type === 'user' && !contactId) {
    next(new Error('contactId is required for user messages'));
    return;
  }

  if ((type === 'agent' || type === 'summary') && !agentId) {
    next(new Error('agentId is required for agent and summary messages'));
    return;
  }

  if (type === 'human' && !authorClientUserId) {
    next(new Error('authorClientUserId is required for human messages'));
    return;
  }

  next();
});
