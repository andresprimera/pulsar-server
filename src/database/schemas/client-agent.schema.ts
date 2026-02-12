import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LlmConfig, LlmConfigSchema } from './llm-config.schema';
import { ChannelProvider } from '../../channels/channel-provider.enum';

@Schema({ _id: false })
export class HireChannelConfig {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ required: true, enum: ChannelProvider })
  provider: ChannelProvider;

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';

  @Prop({ type: Object, required: true })
  credentials: Record<string, any>;

  @Prop({ type: LlmConfigSchema, required: true })
  llmConfig: LlmConfig;
}

export const HireChannelConfigSchema = SchemaFactory.createForClass(HireChannelConfig);

@Schema({ collection: 'client_agents', timestamps: true })
export class ClientAgent extends Document {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  agentId: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ type: [HireChannelConfigSchema], required: true })
  channels: HireChannelConfig[];

  createdAt: Date;
  updatedAt: Date;
}

export const ClientAgentSchema = SchemaFactory.createForClass(ClientAgent);

// Prevent hiring the same agent twice for the same client
ClientAgentSchema.index({ clientId: 1, agentId: 1 }, { unique: true });

// Critical indexes for routing and polling
ClientAgentSchema.index({ status: 1, 'channels.credentials.phoneNumberId': 1 });
ClientAgentSchema.index({ status: 1, 'channels.credentials.email': 1 });
ClientAgentSchema.index({ 'channels.status': 1 });
