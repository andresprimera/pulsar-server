import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientUserSession } from '@persistence/schemas/client-user-session.schema';

export interface CreateClientUserSessionInput {
  userId: Types.ObjectId;
  clientId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

@Injectable()
export class ClientUserSessionRepository {
  constructor(
    @InjectModel(ClientUserSession.name)
    private readonly model: Model<ClientUserSession>,
  ) {}

  async create(
    input: CreateClientUserSessionInput,
  ): Promise<ClientUserSession> {
    const [doc] = await this.model.create([input]);
    return doc;
  }

  async findActiveByTokenHash(
    tokenHash: string,
  ): Promise<ClientUserSession | null> {
    return this.model
      .findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();
  }

  async findById(id: string): Promise<ClientUserSession | null> {
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

  async revokeAllForUser(userId: Types.ObjectId, when: Date): Promise<void> {
    await this.model
      .updateMany({ userId, revokedAt: null }, { revokedAt: when })
      .exec();
  }
}
