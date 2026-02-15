import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { User } from '../schemas/user.schema';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name)
    private readonly model: Model<User>,
  ) {}

  async create(data: Partial<User>, session?: ClientSession): Promise<User> {
    const [doc] = await this.model.create([data], { session });
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
    return this.model.findOne({ email }).session(session).exec();
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

  async findByExternalUserId(
    externalUserId: string,
    clientId: Types.ObjectId,
  ): Promise<User | null> {
    return this.model.findOne({ externalUserId, clientId }).exec();
  }

  async findOrCreateByExternalUserId(
    externalUserId: string,
    clientId: Types.ObjectId,
    name: string,
    session?: ClientSession,
  ): Promise<User> {
    const existing = await this.model
      .findOne({ externalUserId, clientId })
      .session(session)
      .exec();

    if (existing) {
      return existing;
    }

    // Generate a unique email for external users
    const email = `${externalUserId}@external.user`;
    const [user] = await this.model.create(
      [
        {
          externalUserId,
          clientId,
          email,
          name,
          status: 'active',
        },
      ],
      { session },
    );

    return user;
  }
}
