import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CHANNEL_PROVIDER_VALUES } from '@shared/channel-provider.constants';
import {
  AGENT_TOOLING_PROFILE_IDS,
  type AgentToolingProfileId,
} from '@shared/agent-tooling-profile.constants';

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
export class WebhookRegistrationState {
  @Prop({
    type: String,
    required: true,
    enum: ['registering', 'registered', 'failed'],
  })
  status: 'registering' | 'registered' | 'failed';

  @Prop({ type: Date, required: false })
  lastAttemptAt?: Date;

  @Prop({ type: Date, required: false })
  registeredAt?: Date;

  @Prop({ type: Number, required: true, default: 0 })
  attemptCount: number;

  @Prop({ type: String, required: false, maxlength: 500 })
  lastError?: string;

  @Prop({ type: String, required: false })
  fingerprint?: string;
}

export const WebhookRegistrationStateSchema = SchemaFactory.createForClass(
  WebhookRegistrationState,
);

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

  @Prop({ type: String, required: false, index: true })
  telegramBotId?: string;

  /** SHA-256(UTF-8(botToken)) lowercase hex; used for webhook auth without decrypting credentials. */
  @Prop({ type: String, required: false })
  telegramWebhookSecretHex?: string;

  @Prop({ required: true, min: 0, default: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, maxlength: 3 })
  currency: string;

  @Prop({ type: Number, default: null })
  monthlyMessageQuota: number | null;

  @Prop({ type: WebhookRegistrationStateSchema, required: false })
  webhookRegistration?: WebhookRegistrationState;
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
    type: Types.ObjectId,
    ref: 'Personality',
    required: true,
    index: true,
  })
  personalityId: Types.ObjectId;

  /**
   * Optional hire-specific grounding (products, process, FAQs) for this agent
   * on this client ([Task Context] in prompts).
   */
  @Prop({ required: false })
  promptSupplement?: string;

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

  /** Optional hire-level tooling profile override. */
  @Prop({
    type: String,
    required: false,
    enum: [...AGENT_TOOLING_PROFILE_IDS],
  })
  toolingProfileId?: AgentToolingProfileId;

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
ClientAgentSchema.index({ status: 1, 'channels.telegramBotId': 1 });
ClientAgentSchema.index({ 'channels.status': 1 });
ClientAgentSchema.index({
  status: 1,
  'channels.telegramBotId': 1,
  'channels.webhookRegistration.status': 1,
});

function truncateLastErrorOnDoc(channels: unknown): void {
  if (!Array.isArray(channels)) return;
  for (const ch of channels) {
    const wr = (ch as { webhookRegistration?: { lastError?: unknown } })
      ?.webhookRegistration;
    if (wr && typeof wr.lastError === 'string' && wr.lastError.length > 500) {
      wr.lastError = wr.lastError.slice(0, 500);
    }
  }
}

ClientAgentSchema.pre('save', function (next) {
  truncateLastErrorOnDoc((this as any).channels);
  next();
});

ClientAgentSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'updateMany'],
  function (next) {
    const update: any = (this as any).getUpdate?.() ?? {};
    const set = update.$set ?? update;
    for (const key of Object.keys(set)) {
      if (
        /^channels\.\$\.webhookRegistration\.lastError$/.test(key) ||
        /^channels\.\$\[.*?\]\.webhookRegistration\.lastError$/.test(key) ||
        /^channels\.\d+\.webhookRegistration\.lastError$/.test(key)
      ) {
        if (typeof set[key] === 'string' && set[key].length > 500) {
          set[key] = set[key].slice(0, 500);
        }
      }
    }
    next();
  },
);
