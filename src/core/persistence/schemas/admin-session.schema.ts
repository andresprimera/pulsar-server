import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'admin_sessions', timestamps: true })
export class AdminSession extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'AdminUser',
    required: true,
    index: true,
  })
  adminUserId: Types.ObjectId;

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

export const AdminSessionSchema = SchemaFactory.createForClass(AdminSession);

AdminSessionSchema.index({ tokenHash: 1 }, { unique: true });
AdminSessionSchema.index({ adminUserId: 1, revokedAt: 1 });
AdminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
