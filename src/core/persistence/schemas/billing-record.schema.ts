import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class BillingLineItem {
  @Prop({ required: true, enum: ['agent', 'channel'] })
  type: 'agent' | 'channel';

  @Prop({ type: Types.ObjectId, required: true })
  referenceId: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  amount: number;
}

export const BillingLineItemSchema =
  SchemaFactory.createForClass(BillingLineItem);

@Schema({ collection: 'billing_records', timestamps: true })
export class BillingRecord extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;

  @Prop({ type: [BillingLineItemSchema], required: true })
  items: BillingLineItem[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({
    required: true,
    enum: ['generated', 'paid', 'void'],
    default: 'generated',
  })
  status: 'generated' | 'paid' | 'void';
}

export const BillingRecordSchema = SchemaFactory.createForClass(BillingRecord);
BillingRecordSchema.index(
  { clientId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true },
);
