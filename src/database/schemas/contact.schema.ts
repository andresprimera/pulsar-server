import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'contacts', timestamps: true })
export class Contact extends Document {
  @Prop({ required: true, index: true })
  externalUserId: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['whatsapp', 'tiktok', 'instagram'],
    index: true,
  })
  channelType: 'whatsapp' | 'tiktok' | 'instagram';

  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  createdAt: Date;
  updatedAt: Date;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

// Unique per external user per client
ContactSchema.index({ externalUserId: 1, clientId: 1 }, { unique: true });
