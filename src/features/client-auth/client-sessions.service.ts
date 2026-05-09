import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { User } from '@persistence/schemas/user.schema';
import { ClientUserSession } from '@persistence/schemas/client-user-session.schema';
import { ClientUserSessionRepository } from '@persistence/repositories/client-user-session.repository';
import { ClientUsersService } from './client-users.service';

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 60 * 1000;

export interface IssueSessionInput {
  userId: Types.ObjectId;
  clientId: Types.ObjectId;
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssueSessionResult {
  rawToken: string;
  expiresAt: Date;
  session: ClientUserSession;
}

export interface ValidatedSession {
  session: ClientUserSession;
  user: User;
}

@Injectable()
export class ClientSessionsService {
  private readonly logger = new Logger(ClientSessionsService.name);
  private readonly idleTtlMs: number;
  private readonly absoluteTtlMs: number;

  constructor(
    private readonly clientUserSessionRepository: ClientUserSessionRepository,
    private readonly clientUsersService: ClientUsersService,
    configService: ConfigService,
  ) {
    this.idleTtlMs =
      Number(configService.get<string>('CLIENT_SESSION_IDLE_TTL_MS')) ||
      DEFAULT_IDLE_TTL_MS;
    this.absoluteTtlMs =
      Number(configService.get<string>('CLIENT_SESSION_ABSOLUTE_TTL_MS')) ||
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
    const session = await this.clientUserSessionRepository.create({
      userId: input.userId,
      clientId: input.clientId,
      tokenHash,
      expiresAt,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });
    return { rawToken, expiresAt, session };
  }

  async validateAndTouch(rawToken: string): Promise<ValidatedSession | null> {
    const tokenHash = this.hashToken(rawToken);
    const session =
      await this.clientUserSessionRepository.findActiveByTokenHash(tokenHash);
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

    const user = await this.clientUsersService.findById(
      session.userId.toString(),
    );
    if (user === null || user.status !== 'active') {
      // Defensive: revoke session attached to a missing or non-active user
      // so future requests with the same cookie are rejected at the DB layer.
      await this.clientUserSessionRepository
        .revoke(session.id, now)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to revoke session for inactive client user: ${
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
      await this.clientUserSessionRepository
        .touchLastSeen(session.id, now, nextExpiresAt)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to touch client user session: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    return { session, user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.clientUserSessionRepository.revoke(sessionId, new Date());
  }

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    await this.clientUserSessionRepository.revokeAllForUser(userId, new Date());
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
