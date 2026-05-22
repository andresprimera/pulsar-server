import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LEAD_STATES, type LeadState } from '@shared/lead-state.constants';

/**
 * Mongoose document for the `leads` collection.
 *
 * One Lead per `(clientId, conversationId)` pair. The `state` is a
 * deterministic projection of `fields` and the disqualify flag; the
 * domain {@link LeadLifecycleService} owns transitions.
 */
@Schema({ collection: 'leads', timestamps: true })
export class Lead extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Contact',
    required: true,
  })
  contactId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Agent',
    required: true,
  })
  agentId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: [...LEAD_STATES],
    default: 'new',
  })
  state: LeadState;

  @Prop({ type: Object, default: {} })
  fields: Record<string, unknown>;

  @Prop({ type: Date })
  lastQualificationAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

// One lead per (client, conversation).
LeadSchema.index({ clientId: 1, conversationId: 1 }, { unique: true });

// Tenant-scoped state listings, freshest-first.
LeadSchema.index({ clientId: 1, state: 1, updatedAt: -1 });
