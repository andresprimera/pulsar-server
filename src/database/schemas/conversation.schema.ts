import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
