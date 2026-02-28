import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'messages', timestamps: true })
export class Message extends Document {
  @Prop({ required: true })
  content: string;

  @Prop({
    required: true,
    enum: ['user', 'agent', 'summary'],
    index: true,
  })
  type: 'user' | 'agent' | 'summary';

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

// Validation: user messages must have contactId, agent/summary messages must have agentId
MessageSchema.pre('validate', function (next) {
  if (this.type === 'user' && !this.contactId) {
    next(new Error('contactId is required for user messages'));
    return;
  }

  if ((this.type === 'agent' || this.type === 'summary') && !this.agentId) {
    next(new Error('agentId is required for agent and summary messages'));
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

  if (type === 'user' && !contactId) {
    next(new Error('contactId is required for user messages'));
    return;
  }

  if ((type === 'agent' || type === 'summary') && !agentId) {
    next(new Error('agentId is required for agent and summary messages'));
    return;
  }

  next();
});
