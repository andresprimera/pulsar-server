import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'llm_usage_logs', timestamps: true })
export class LlmUsageLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Agent', required: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Contact', index: true })
  contactId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', index: true })
  conversationId?: Types.ObjectId;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  llmModel: string;

  @Prop({ required: true })
  inputTokens: number;

  @Prop({ required: true })
  outputTokens: number;

  @Prop({ required: true })
  totalTokens: number;

  @Prop({ required: true, enum: ['chat', 'summary'], index: true })
  operationType: 'chat' | 'summary';

  createdAt?: Date;
  updatedAt?: Date;
}

export const LlmUsageLogSchema = SchemaFactory.createForClass(LlmUsageLog);
