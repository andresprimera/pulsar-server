import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { User } from '@persistence/schemas/user.schema';
import type { ClientRole } from '@shared/auth/client-roles';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name)
    private readonly model: Model<User>,
  ) {}

  async create(data: Partial<User>, session?: ClientSession): Promise<User> {
    const opts = session ? { session } : {};
    const [doc] = await this.model.create([data], opts);
    return doc;
  }

  async findAll(): Promise<User[]> {
    return this.model.find().exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.model.findById(id).exec();
  }

  async findByEmail(
    email: string,
    session?: ClientSession,
  ): Promise<User | null> {
    const normalized = String(email).trim().toLowerCase();
    const query = this.model
      .findOne({ email: normalized })
      .collation({ locale: 'en', strength: 2 });
    return (session ? query.session(session) : query).exec();
  }

  async findByEmailWithPasswordHash(
    email: string,
    session?: ClientSession,
  ): Promise<User | null> {
    const normalized = String(email).trim().toLowerCase();
    const query = this.model
      .findOne({ email: normalized })
      .collation({ locale: 'en', strength: 2 })
      .select('+passwordHash');
    return (session ? query.session(session) : query).exec();
  }

  async setPasswordHash(id: string, hash: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { passwordHash: hash }).exec();
  }

  async setLastLoginAt(id: string, when: Date): Promise<void> {
    await this.model.updateOne({ _id: id }, { lastLoginAt: when }).exec();
  }

  async setClientRole(id: string, clientRole: ClientRole): Promise<void> {
    await this.model.updateOne({ _id: id }, { clientRole }).exec();
  }

  async findByStatus(
    status: 'active' | 'inactive' | 'archived',
  ): Promise<User[]> {
    return this.model.find({ status }).exec();
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async findByClient(clientId: Types.ObjectId): Promise<User[]> {
    return this.model.find({ clientId }).exec();
  }

  async findActiveByClient(clientId: Types.ObjectId): Promise<User[]> {
    return this.model.find({ clientId, status: 'active' }).exec();
  }
}
