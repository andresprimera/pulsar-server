import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'client_catalog_items', timestamps: true })
export class ClientCatalogItem extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  sku: string;

  @Prop({ required: true, maxlength: 200, trim: true })
  name: string;

  @Prop({ required: false, maxlength: 4000 })
  description?: string;

  @Prop({ required: true, enum: ['product', 'service'] })
  type: 'product' | 'service';

  /** Minor units (integer). When omitted, item has no list price. */
  @Prop({ required: false, min: 0 })
  unitAmountMinor?: number;

  @Prop({
    required: false,
    uppercase: true,
    maxlength: 3,
    match: /^[A-Z]{3}$/,
  })
  currency?: string;

  @Prop({ required: true, default: true, index: true })
  active: boolean;

  @Prop({ required: false })
  deactivatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ClientCatalogItemSchema =
  SchemaFactory.createForClass(ClientCatalogItem);

ClientCatalogItemSchema.index({ clientId: 1, sku: 1 }, { unique: true });
ClientCatalogItemSchema.index({ clientId: 1, active: 1 });
ClientCatalogItemSchema.index({ clientId: 1, sku: 1, _id: 1 });
