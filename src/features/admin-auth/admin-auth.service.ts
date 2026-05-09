import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AdminUser } from '@persistence/schemas/admin-user.schema';
import { AdminUsersService } from './admin-users.service';
import { AdminSessionsService } from './admin-sessions.service';
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
  admin: AdminUser;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly adminSessionsService: AdminSessionsService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const admin = await this.adminUsersService.findByEmailWithPasswordHash(
      input.email,
    );

    if (admin === null) {
      // Constant-time defense: always run an argon2 verify against a stable
      // dummy hash so wall-clock time does not leak whether the email exists.
      await this.adminUsersService
        .verifyPassword(await getArgon2DummyHash(), input.password)
        .catch(() => false);
      this.logger.warn(`Login failed for ${input.email}: unknown email`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.status !== 'active') {
      // Still equalize timing for the disabled branch.
      await this.adminUsersService
        .verifyPassword(admin.passwordHash, input.password)
        .catch(() => false);
      this.logger.warn(
        `Login refused for ${admin.email}: admin status is ${admin.status}`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await this.adminUsersService.verifyPassword(
      admin.passwordHash,
      input.password,
    );
    if (!passwordValid) {
      this.logger.warn(`Login failed for ${admin.email}: bad password`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const issued = await this.adminSessionsService.issue({
      adminUserId: admin._id,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });
    await this.adminUsersService.setLastLoginAt(admin.id, new Date());
    this.logger.log(`Admin ${admin.email} logged in`);
    return {
      rawToken: issued.rawToken,
      expiresAt: issued.expiresAt,
      admin,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.adminSessionsService.revoke(sessionId);
  }

  async getMe(adminUserId: string): Promise<AdminUser | null> {
    return this.adminUsersService.findById(adminUserId);
  }
}
