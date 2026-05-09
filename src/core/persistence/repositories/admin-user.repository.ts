import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminUser,
  AdminUserStatus,
} from '@persistence/schemas/admin-user.schema';

export interface CreateAdminUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  status?: AdminUserStatus;
}

@Injectable()
export class AdminUserRepository {
  constructor(
    @InjectModel(AdminUser.name)
    private readonly model: Model<AdminUser>,
  ) {}

  async create(input: CreateAdminUserInput): Promise<AdminUser> {
    const [doc] = await this.model.create([input]);
    return doc;
  }

  async findById(id: string): Promise<AdminUser | null> {
    return this.model.findById(id).exec();
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    return this.model
      .findOne({ email: email.trim().toLowerCase() })
      .collation({ locale: 'en', strength: 2 })
      .exec();
  }

  async findByEmailWithPasswordHash(email: string): Promise<AdminUser | null> {
    return this.model
      .findOne({ email: email.trim().toLowerCase() })
      .collation({ locale: 'en', strength: 2 })
      .select('+passwordHash')
      .exec();
  }

  async setLastLoginAt(id: string, when: Date): Promise<void> {
    await this.model.updateOne({ _id: id }, { lastLoginAt: when }).exec();
  }

  async setStatus(id: string, status: AdminUserStatus): Promise<void> {
    await this.model.updateOne({ _id: id }, { status }).exec();
  }

  async count(): Promise<number> {
    return this.model.countDocuments().exec();
  }
}
