import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { User } from '@persistence/schemas/user.schema';
import { UserRepository } from '@persistence/repositories/user.repository';

@Injectable()
export class ClientUsersService {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByEmailWithPasswordHash(email: string): Promise<User | null> {
    return this.userRepository.findByEmailWithPasswordHash(email);
  }

  async setPasswordHash(id: string, plainPassword: string): Promise<void> {
    const hash = await argon2.hash(plainPassword, {
      type: argon2.argon2id,
    });
    await this.userRepository.setPasswordHash(id, hash);
  }

  async verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
    return argon2.verify(passwordHash, plain);
  }

  async setLastLoginAt(id: string, when: Date): Promise<void> {
    await this.userRepository.setLastLoginAt(id, when);
  }
}
