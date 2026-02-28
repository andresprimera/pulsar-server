import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactIdentifierType =
  | 'phone'
  | 'username'
  | 'platform_id'
  | 'email';

@Schema({ _id: false })
export class ContactIdentifier {
  @Prop({
    required: true,
    enum: ['phone', 'username', 'platform_id', 'email'],
  })
  type: ContactIdentifierType;

  @Prop({ required: true })
  value: string;
}

export const ContactIdentifierSchema =
  SchemaFactory.createForClass(ContactIdentifier);

@Schema({ collection: 'contacts', timestamps: true })
export class Contact extends Document {
  @Prop({ required: true, index: true, immutable: true })
  externalId: string;

  @Prop()
  externalIdRaw?: string;

  @Prop({ type: ContactIdentifierSchema })
  identifier?: ContactIdentifier;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Channel',
    required: true,
    index: true,
  })
  channelId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop({
    required: true,
    enum: ['active', 'blocked', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'blocked' | 'archived';

  createdAt: Date;
  updatedAt: Date;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

export function throwsIfExternalIdMutation(update: Record<string, any>): void {
  if (!update) {
    return;
  }

  const directMutation = Object.prototype.hasOwnProperty.call(update, 'externalId');
  const setMutation =
    !!update.$set &&
    Object.prototype.hasOwnProperty.call(update.$set, 'externalId');
  const unsetMutation =
    !!update.$unset &&
    Object.prototype.hasOwnProperty.call(update.$unset, 'externalId');
  const renameMutation =
    !!update.$rename &&
    Object.prototype.hasOwnProperty.call(update.$rename, 'externalId');

  if (directMutation || setMutation || unsetMutation || renameMutation) {
    throw new Error('externalId is immutable and cannot be modified');
  }
}

ContactSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, any>;
  throwsIfExternalIdMutation(update);
});

// Unique per normalized identifier per client per channel
ContactSchema.index(
  { clientId: 1, channelId: 1, externalId: 1 },
  { unique: true },
);
