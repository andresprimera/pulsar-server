import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { AdminUser } from '@persistence/schemas/admin-user.schema';
import { AdminSession } from '@persistence/schemas/admin-session.schema';
import { AdminSessionRepository } from '@persistence/repositories/admin-session.repository';
import { AdminUsersService } from './admin-users.service';

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 60 * 1000;

export interface IssueSessionInput {
  adminUserId: Types.ObjectId;
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssueSessionResult {
  rawToken: string;
  expiresAt: Date;
  session: AdminSession;
}

export interface ValidatedSession {
  session: AdminSession;
  admin: AdminUser;
}

@Injectable()
export class AdminSessionsService {
  private readonly logger = new Logger(AdminSessionsService.name);
  private readonly idleTtlMs: number;
  private readonly absoluteTtlMs: number;

  constructor(
    private readonly adminSessionRepository: AdminSessionRepository,
    private readonly adminUsersService: AdminUsersService,
    configService: ConfigService,
  ) {
    this.idleTtlMs =
      Number(configService.get<string>('ADMIN_SESSION_IDLE_TTL_MS')) ||
      DEFAULT_IDLE_TTL_MS;
    this.absoluteTtlMs =
      Number(configService.get<string>('ADMIN_SESSION_ABSOLUTE_TTL_MS')) ||
      DEFAULT_ABSOLUTE_TTL_MS;
  }

  /**
   * Absolute (hard-cap) session lifetime in milliseconds. Browsers should
   * treat this as the cookie's outer bound; even a continuously-active
   * session is forced to re-authenticate after this window.
   */
  getAbsoluteTtlMs(): number {
    return this.absoluteTtlMs;
  }

  async issue(input: IssueSessionInput): Promise<IssueSessionResult> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.idleTtlMs);
    const session = await this.adminSessionRepository.create({
      adminUserId: input.adminUserId,
      tokenHash,
      expiresAt,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });
    return { rawToken, expiresAt, session };
  }

  async validateAndTouch(rawToken: string): Promise<ValidatedSession | null> {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.adminSessionRepository.findActiveByTokenHash(
      tokenHash,
    );
    if (session === null) {
      return null;
    }

    const now = new Date();
    const absoluteCutoff = new Date(
      session.get('createdAt').getTime() + this.absoluteTtlMs,
    );
    if (now >= absoluteCutoff) {
      return null;
    }

    const admin = await this.adminUsersService.findById(
      session.adminUserId.toString(),
    );
    if (admin === null || admin.status !== 'active') {
      // Defensive: revoke session attached to a missing or disabled admin
      // so future requests with the same cookie are rejected at the DB layer.
      await this.adminSessionRepository
        .revoke(session.id, now)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to revoke session for inactive admin: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return null;
    }

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_THROTTLE_MS) {
      const nextExpiresAt = new Date(
        Math.min(now.getTime() + this.idleTtlMs, absoluteCutoff.getTime()),
      );
      await this.adminSessionRepository
        .touchLastSeen(session.id, now, nextExpiresAt)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to touch admin session: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    return { session, admin };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.adminSessionRepository.revoke(sessionId, new Date());
  }

  async revokeAllForAdmin(adminUserId: Types.ObjectId): Promise<void> {
    await this.adminSessionRepository.revokeAllForAdmin(
      adminUserId,
      new Date(),
    );
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
