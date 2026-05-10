import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminUser } from '@persistence/schemas/admin-user.schema';
import { AdminUserRepository } from '@persistence/repositories/admin-user.repository';
import type { AdminRole } from '@shared/auth/admin-roles';

export interface CreateAdminInput {
  email: string;
  password: string;
  displayName: string;
  role?: AdminRole;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly adminUserRepository: AdminUserRepository) {}

  async findById(id: string): Promise<AdminUser | null> {
    return this.adminUserRepository.findById(id);
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    return this.adminUserRepository.findByEmail(email);
  }

  async findByEmailWithPasswordHash(email: string): Promise<AdminUser | null> {
    return this.adminUserRepository.findByEmailWithPasswordHash(email);
  }

  async create(input: CreateAdminInput): Promise<AdminUser> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    return this.adminUserRepository.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      ...(input.role !== undefined ? { role: input.role } : {}),
    });
  }

  async setLastLoginAt(id: string, when: Date): Promise<void> {
    await this.adminUserRepository.setLastLoginAt(id, when);
  }

  async setRole(id: string, role: AdminRole): Promise<void> {
    await this.adminUserRepository.setRole(id, role);
  }

  async count(): Promise<number> {
    return this.adminUserRepository.count();
  }

  async verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
    return argon2.verify(passwordHash, plain);
  }
}
