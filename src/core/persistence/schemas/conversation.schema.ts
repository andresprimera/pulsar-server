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
