import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CLIENT_ROLES, type ClientRole } from '@shared/auth/client-roles';

@Schema({ collection: 'users', timestamps: true })
export class User extends Document {
  @Prop({
    required: true,
    set: (v: string) => String(v).trim().toLowerCase(),
  })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({
    required: true,
    enum: CLIENT_ROLES,
    default: 'operator',
    index: true,
  })
  clientRole: ClientRole;

  @Prop({ required: false, select: false })
  passwordHash?: string;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { email: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'email_1_ci',
  },
);
