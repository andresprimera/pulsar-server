import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CONTROL_MODES,
  ControlMode,
  DEFAULT_CONTROL_MODE,
} from '@shared/inbox/control-mode';

@Schema({ collection: 'conversations', timestamps: true })
export class Conversation extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Contact',
    required: true,
    index: true,
  })
  contactId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Channel',
    required: true,
    index: true,
  })
  channelId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['open', 'closed', 'archived'],
    default: 'open',
    index: true,
  })
  status: 'open' | 'closed' | 'archived';

  @Prop({
    required: true,
    index: true,
  })
  lastMessageAt: Date;

  @Prop()
  summary?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({
    required: true,
    enum: CONTROL_MODES,
    default: DEFAULT_CONTROL_MODE,
  })
  controlMode: ControlMode;

  /**
   * Denormalized reference to the responsible hired agent (`ClientAgent._id`)
   * for the inbox list `agentId` filter. Backfilled by
   * `InboxConversationEnrichmentBackfillMigration`; written on hire-routed
   * conversations going forward. Optional because pre-migration rows may
   * have no resolvable `(clientId, channelId)` → `ClientAgent` mapping.
   *
   * Not on the wire — see `ConversationSummaryDto`.
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'ClientAgent',
    required: false,
  })
  clientAgentId?: Types.ObjectId;

  /**
   * Lowercased + trimmed denormalized copy of `Contact.name` for case-
   * insensitive substring search via the inbox list `q` filter. Maintained
   * by the enrichment backfill (Phase 1) and by future contact-rename
   * propagation (Phase 2+). No index — search rides `inbox_list_idx`.
   */
  @Prop({ type: String, required: false, maxlength: 256 })
  contactNameLower?: string;

  /**
   * Server-truncated (≤ 280 chars) preview of the most recent
   * non-suppressed message. Frozen alongside `lastMessageAt` while
   * `controlMode === 'human'` — see `ConversationSummaryDto` JSDoc.
   */
  @Prop({ type: String, required: false })
  lastMessagePreview?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({
  clientId: 1,
  contactId: 1,
  channelId: 1,
  status: 1,
});

ConversationSchema.index(
  {
    clientId: 1,
    contactId: 1,
    channelId: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: 'open' },
  },
);

// Covering index for the inbox list query:
//   filter { clientId, status }, sort { lastMessageAt: -1, _id: -1 } for stable
//   cursor pagination. Distinct from the routing-prefixed compound above.
ConversationSchema.index(
  {
    clientId: 1,
    status: 1,
    lastMessageAt: -1,
    _id: -1,
  },
  { name: 'inbox_list_idx' },
);

// Covering index for the inbox list query when filtered by `agentId`
// (resolved to `clientAgentId`). Prefix matches the read pattern used by
// `ConversationRepository.findInboxPageEnriched` via `.hint(...)`.
ConversationSchema.index(
  {
    clientId: 1,
    clientAgentId: 1,
    status: 1,
    lastMessageAt: -1,
    _id: -1,
  },
  { name: 'inbox_list_agent_idx', background: true },
);
