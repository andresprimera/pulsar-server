import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LlmConfig, LlmConfigSchema } from './llm-config.schema';
import { CHANNEL_PROVIDER_VALUES } from '@shared/channel-provider.constants';

@Schema({ _id: false })
export class AgentPricingSnapshot {
  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, maxlength: 3 })
  currency: string;

  @Prop({ type: Number, default: null })
  monthlyTokenQuota: number | null;
}

export const AgentPricingSnapshotSchema =
  SchemaFactory.createForClass(AgentPricingSnapshot);

@Schema({ _id: false })
export class HireChannelConfig {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: CHANNEL_PROVIDER_VALUES })
  provider: (typeof CHANNEL_PROVIDER_VALUES)[number];

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';

  @Prop({ type: Object, required: false, select: false })
  credentials?: Record<string, any>;

  // Unencrypted routing keys for fast lookup
  @Prop({ type: String, required: false, index: true })
  phoneNumberId?: string;

  @Prop({ type: String, required: false, index: true })
  tiktokUserId?: string;

  @Prop({ type: String, required: false, index: true })
  instagramAccountId?: string;

  @Prop({ type: LlmConfigSchema, required: true })
  llmConfig: LlmConfig;

  @Prop({ required: true, min: 0, default: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, maxlength: 3 })
  currency: string;

  @Prop({ type: Number, default: null })
  monthlyMessageQuota: number | null;
}

export const HireChannelConfigSchema =
  SchemaFactory.createForClass(HireChannelConfig);

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

  @Prop({ type: AgentPricingSnapshotSchema, required: true })
  agentPricing: AgentPricingSnapshot;

  @Prop({ required: true })
  billingAnchor: Date;

  @Prop({ type: [HireChannelConfigSchema], required: true })
  channels: HireChannelConfig[];

  createdAt: Date;
  updatedAt: Date;
}

export const ClientAgentSchema = SchemaFactory.createForClass(ClientAgent);

// Prevent hiring the same agent twice for the same client
ClientAgentSchema.index({ clientId: 1, agentId: 1 }, { unique: true });

// Critical indexes for routing and polling
ClientAgentSchema.index({ status: 1, 'channels.phoneNumberId': 1 });
ClientAgentSchema.index({ status: 1, 'channels.tiktokUserId': 1 });
ClientAgentSchema.index({ status: 1, 'channels.instagramAccountId': 1 });
ClientAgentSchema.index({ 'channels.status': 1 });
