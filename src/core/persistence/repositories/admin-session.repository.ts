import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminSession } from '@persistence/schemas/admin-session.schema';

export interface CreateAdminSessionInput {
  adminUserId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

@Injectable()
export class AdminSessionRepository {
  constructor(
    @InjectModel(AdminSession.name)
    private readonly model: Model<AdminSession>,
  ) {}

  async create(input: CreateAdminSessionInput): Promise<AdminSession> {
    const [doc] = await this.model.create([input]);
    return doc;
  }

  async findActiveByTokenHash(tokenHash: string): Promise<AdminSession | null> {
    return this.model
      .findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();
  }

  async findById(id: string): Promise<AdminSession | null> {
    return this.model.findById(id).exec();
  }

  async touchLastSeen(
    id: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    await this.model.updateOne({ _id: id }, { lastSeenAt, expiresAt }).exec();
  }

  async revoke(id: string, when: Date): Promise<void> {
    await this.model.updateOne({ _id: id }, { revokedAt: when }).exec();
  }

  async revokeAllForAdmin(
    adminUserId: Types.ObjectId,
    when: Date,
  ): Promise<void> {
    await this.model
      .updateMany({ adminUserId, revokedAt: null }, { revokedAt: when })
      .exec();
  }
}
