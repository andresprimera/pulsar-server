import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  AGENT_TOOLING_PROFILE_IDS,
  type AgentToolingProfileId,
} from '@shared/agent-tooling-profile.constants';
import { AGENT_KINDS, type AgentKind } from '@shared/agent-kind.constants';

@Schema({ collection: 'agents', timestamps: true })
export class Agent extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({ default: false })
  createdBySeeder: boolean;

  @Prop({ type: Number, default: null })
  monthlyTokenQuota: number | null; // null = unlimited

  /** Optional default tooling profile when hire does not override. */
  @Prop({
    type: String,
    required: false,
    enum: [...AGENT_TOOLING_PROFILE_IDS],
  })
  toolingProfileId?: AgentToolingProfileId;

  @Prop({ type: String, required: true, enum: [...AGENT_KINDS] })
  kind: AgentKind;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);
