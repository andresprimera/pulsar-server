import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'channel_prices', timestamps: true })
export class ChannelPrice extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: ['active', 'deprecated'], default: 'active' })
  status: 'active' | 'deprecated';
}

export const ChannelPriceSchema = SchemaFactory.createForClass(ChannelPrice);
// One document per (channel, currency)
ChannelPriceSchema.index({ channelId: 1, currency: 1 }, { unique: true });
// Enforce at most one active price per (channel, currency)
ChannelPriceSchema.index(
  { channelId: 1, currency: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
);
