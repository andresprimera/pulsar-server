import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'agent_prices', timestamps: true })
export class AgentPrice extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Agent', required: true })
  agentId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string; // ISO 4217: USD, EUR, BRL, etc.

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: ['active', 'deprecated'], default: 'active' })
  status: 'active' | 'deprecated';
}

export const AgentPriceSchema = SchemaFactory.createForClass(AgentPrice);
// One document per (agent, currency)
AgentPriceSchema.index({ agentId: 1, currency: 1 }, { unique: true });
// Enforce at most one active price per (agent, currency)
AgentPriceSchema.index(
  { agentId: 1, currency: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
);
