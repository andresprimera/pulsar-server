import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const CLIENT_SALE_STATUS_VALUES = [
  'lead',
  'quoted',
  'won',
  'lost',
  'cancelled',
] as const;

export type ClientSaleStatus = (typeof CLIENT_SALE_STATUS_VALUES)[number];

@Schema({ collection: 'client_sales', timestamps: true })
export class ClientSale extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ClientCatalogItem', required: false })
  catalogItemId?: Types.ObjectId;

  @Prop({ required: true, maxlength: 200, trim: true })
  title: string;

  @Prop({ required: false, maxlength: 2000 })
  notes?: string;

  @Prop({
    required: true,
    enum: CLIENT_SALE_STATUS_VALUES,
  })
  status: ClientSaleStatus;

  @Prop({ required: true, min: 0 })
  amountMinor: number;

  @Prop({
    required: true,
    uppercase: true,
    maxlength: 3,
    match: /^[A-Z]{3}$/,
  })
  currency: string;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop({ required: false, trim: true })
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ClientSaleSchema = SchemaFactory.createForClass(ClientSale);

ClientSaleSchema.index({ clientId: 1, occurredAt: -1 });
ClientSaleSchema.index(
  { clientId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $exists: true, $type: 'string', $ne: '' },
    },
  },
);
