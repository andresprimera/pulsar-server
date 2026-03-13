import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'clients', timestamps: true })
export class Client extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['individual', 'organization'],
    default: 'organization',
    index: true,
  })
  type: 'individual' | 'organization';

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  ownerUserId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({
    required: true,
    uppercase: true,
    match: /^[A-Z]{3}$/,
    default: 'USD',
  })
  billingCurrency: string; // ISO 4217

  /**
   * Billing cycle anchor for the entire client. Set once at creation, immutable.
   * All billing periods and quota resets are derived from this date.
   */
  @Prop({ required: true })
  billingAnchor: Date;

  @Prop({ type: Object })
  llmPreferences?: {
    provider: string;
    defaultModel: string;
  };

  /**
   * Optional client-specific brand voice instructions. Refines tone/style
   * without replacing personality. Injected into the prompt alongside personality.
   */
  @Prop({ required: false })
  brandVoice?: string;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
