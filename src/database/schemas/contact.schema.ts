import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
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

  @Prop()
  contactSummary?: string;

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

const MAX_METADATA_SIZE_BYTES = 16 * 1024;

export function validateMetadataSize(metadata?: Record<string, any>): void {
  if (metadata === undefined) {
    return;
  }

  const size = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
  if (size > MAX_METADATA_SIZE_BYTES) {
    throw new BadRequestException('contact metadata exceeds 16KB limit');
  }
}

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

  if (!update) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(update, 'metadata')) {
    validateMetadataSize(update.metadata);
  }

  if (
    update.$set &&
    Object.prototype.hasOwnProperty.call(update.$set, 'metadata')
  ) {
    validateMetadataSize(update.$set.metadata);
  }

  if (
    update.$setOnInsert &&
    Object.prototype.hasOwnProperty.call(update.$setOnInsert, 'metadata')
  ) {
    validateMetadataSize(update.$setOnInsert.metadata);
  }
});

ContactSchema.pre('validate', function () {
  const contact = this as Contact;
  validateMetadataSize(contact.metadata);
});

// Unique per normalized identifier per client per channel
ContactSchema.index(
  { clientId: 1, channelId: 1, externalId: 1 },
  { unique: true },
);
