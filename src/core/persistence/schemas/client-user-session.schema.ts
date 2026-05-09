import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'client_user_sessions', timestamps: true })
export class ClientUserSession extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true, type: Date })
  expiresAt: Date;

  @Prop({ required: true, type: Date, default: () => new Date() })
  lastSeenAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({
    type: String,
    default: null,
    set: (v?: string | null) => (v == null ? null : v.slice(0, 512)),
    maxlength: 512,
  })
  userAgent: string | null;

  @Prop({ type: String, default: null, maxlength: 64 })
  ip: string | null;
}

export const ClientUserSessionSchema =
  SchemaFactory.createForClass(ClientUserSession);

ClientUserSessionSchema.index({ tokenHash: 1 }, { unique: true });
ClientUserSessionSchema.index({ userId: 1, revokedAt: 1 });
ClientUserSessionSchema.index({ clientId: 1, revokedAt: 1 });
ClientUserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
