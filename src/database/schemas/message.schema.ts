import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'messages', timestamps: true })
export class Message extends Document {
  @Prop({ required: true })
  content: string;

  @Prop({
    required: true,
    enum: ['user', 'agent'],
    index: true,
  })
  type: 'user' | 'agent';

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  userId?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Agent',
    index: true,
  })
  agentId?: Types.ObjectId;

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
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Validation: user messages must have userId, agent messages must have agentId
MessageSchema.pre('save', function (next) {
  if (this.type === 'user' && !this.userId) {
    next(new Error('userId is required for user messages'));
  } else if (this.type === 'agent' && !this.agentId) {
    next(new Error('agentId is required for agent messages'));
  } else {
    next();
  }
});

// Validation for updates
MessageSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  if (update.type === 'user' && !update.userId) {
    next(new Error('userId is required for user messages'));
  } else if (update.type === 'agent' && !update.agentId) {
    next(new Error('agentId is required for agent messages'));
  } else {
    next();
  }
});
