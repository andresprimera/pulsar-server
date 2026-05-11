import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ADMIN_ROLES, type AdminRole } from '@shared/auth/admin-roles';

export type AdminUserStatus = 'active' | 'disabled';

@Schema({ collection: 'admin_users', timestamps: true })
export class AdminUser extends Document {
  @Prop({
    required: true,
    unique: true,
    set: (v: string) => v.trim().toLowerCase(),
  })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({
    required: true,
    enum: ['active', 'disabled'],
    default: 'active',
    index: true,
  })
  status: AdminUserStatus;

  @Prop({
    required: true,
    enum: ADMIN_ROLES,
    default: 'support',
    index: true,
  })
  role: AdminRole;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);

AdminUserSchema.index(
  { email: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
