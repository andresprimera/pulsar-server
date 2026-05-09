import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { User } from '@persistence/schemas/user.schema';
import { ClientUsersService } from './client-users.service';
import { ClientSessionsService } from './client-sessions.service';
import { getArgon2DummyHash } from './argon2-dummy-hash';

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string | null;
  ip?: string | null;
}

export interface LoginResult {
  rawToken: string;
  expiresAt: Date;
  user: User;
}

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);

  constructor(
    private readonly clientUsersService: ClientUsersService,
    private readonly clientSessionsService: ClientSessionsService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.clientUsersService.findByEmailWithPasswordHash(
      input.email,
    );

    if (user === null) {
      // Constant-time defense: always run an argon2 verify against a stable
      // dummy hash so wall-clock time does not leak whether the email exists.
      await this.clientUsersService
        .verifyPassword(await getArgon2DummyHash(), input.password)
        .catch(() => false);
      this.logger.warn(`Login failed for ${input.email}: unknown email`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.passwordHash === undefined || user.passwordHash === null) {
      // Legacy seed user without a password hash. Equalize timing with
      // a dummy verify and reject identically.
      await this.clientUsersService
        .verifyPassword(await getArgon2DummyHash(), input.password)
        .catch(() => false);
      this.logger.warn(
        `Login failed for ${user.email}: no password hash on record`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      // Still equalize timing for the non-active branch.
      await this.clientUsersService
        .verifyPassword(user.passwordHash, input.password)
        .catch(() => false);
      this.logger.warn(
        `Login refused for ${user.email}: user status is ${user.status}`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await this.clientUsersService.verifyPassword(
      user.passwordHash,
      input.password,
    );
    if (!passwordValid) {
      this.logger.warn(`Login failed for ${user.email}: bad password`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const issued = await this.clientSessionsService.issue({
      userId: user._id,
      clientId: user.clientId,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });
    await this.clientUsersService.setLastLoginAt(user.id, new Date());
    this.logger.log(`Client user ${user.email} logged in`);
    return {
      rawToken: issued.rawToken,
      expiresAt: issued.expiresAt,
      user,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.clientSessionsService.revoke(sessionId);
  }

  async getMe(userId: string): Promise<User | null> {
    return this.clientUsersService.findById(userId);
  }
}
