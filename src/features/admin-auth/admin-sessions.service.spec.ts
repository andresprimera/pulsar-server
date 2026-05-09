import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AdminSessionsService } from './admin-sessions.service';
import { AdminUsersService } from './admin-users.service';
import { AdminSessionRepository } from '@persistence/repositories/admin-session.repository';
import type { AdminUser } from '@persistence/schemas/admin-user.schema';
import type { AdminSession } from '@persistence/schemas/admin-session.schema';

const buildAdmin = (overrides: Partial<AdminUser> = {}): AdminUser => {
  const id = new Types.ObjectId();
  return {
    _id: id,
    id: id.toHexString(),
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active',
    lastLoginAt: null,
    ...overrides,
  } as unknown as AdminUser;
};

const buildSession = (overrides: Partial<AdminSession> = {}): AdminSession => {
  const id = new Types.ObjectId();
  const now = Date.now();
  const createdAt = new Date(now - 60_000);
  return {
    _id: id,
    id: id.toHexString(),
    adminUserId: new Types.ObjectId(),
    tokenHash: 'hash',
    expiresAt: new Date(now + 30 * 60_000),
    lastSeenAt: new Date(now - 1_000),
    revokedAt: null,
    userAgent: null,
    ip: null,
    get: jest.fn().mockReturnValue(createdAt),
    ...overrides,
  } as unknown as AdminSession;
};

describe('AdminSessionsService', () => {
  let service: AdminSessionsService;
  let sessionRepository: jest.Mocked<AdminSessionRepository>;
  let adminUsersService: jest.Mocked<AdminUsersService>;

  beforeEach(async () => {
    sessionRepository = {
      create: jest.fn(),
      findActiveByTokenHash: jest.fn(),
      touchLastSeen: jest.fn().mockResolvedValue(undefined),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForAdmin: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AdminSessionRepository>;
    adminUsersService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<AdminUsersService>;
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSessionsService,
        { provide: AdminSessionRepository, useValue: sessionRepository },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(AdminSessionsService);
  });

  describe('issue', () => {
    it('returns a fresh raw token and persists the session', async () => {
      const adminUserId = new Types.ObjectId();
      const session = buildSession({ adminUserId });
      sessionRepository.create.mockResolvedValue(session);

      const result = await service.issue({ adminUserId });

      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken.length).toBeGreaterThan(0);
      expect(sessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      // The plaintext token should NOT be passed to the repository.
      const repoArgs = sessionRepository.create.mock.calls[0][0];
      expect(repoArgs.tokenHash).not.toBe(result.rawToken);
    });

    it('issues a different token on every call', async () => {
      sessionRepository.create.mockResolvedValue(buildSession());
      const a = await service.issue({ adminUserId: new Types.ObjectId() });
      const b = await service.issue({ adminUserId: new Types.ObjectId() });
      expect(a.rawToken).not.toBe(b.rawToken);
    });
  });

  describe('validateAndTouch', () => {
    it('returns null when no active session matches the token hash', async () => {
      sessionRepository.findActiveByTokenHash.mockResolvedValue(null);
      expect(await service.validateAndTouch('any-token')).toBeNull();
    });

    it('returns null and revokes the session when the admin is disabled', async () => {
      const session = buildSession();
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      adminUsersService.findById.mockResolvedValue(
        buildAdmin({ status: 'disabled' }),
      );

      const result = await service.validateAndTouch('any-token');

      expect(result).toBeNull();
      expect(sessionRepository.revoke).toHaveBeenCalledWith(
        session.id,
        expect.any(Date),
      );
    });

    it('returns null when the admin is missing', async () => {
      const session = buildSession();
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      adminUsersService.findById.mockResolvedValue(null);

      const result = await service.validateAndTouch('any-token');

      expect(result).toBeNull();
      expect(sessionRepository.revoke).toHaveBeenCalled();
    });

    it('returns the validated session and admin on success', async () => {
      const session = buildSession();
      const admin = buildAdmin();
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      adminUsersService.findById.mockResolvedValue(admin);

      const result = await service.validateAndTouch('any-token');

      expect(result).not.toBeNull();
      expect(result?.session).toBe(session);
      expect(result?.admin).toBe(admin);
    });

    it('skips the touch DB write when within the throttle window', async () => {
      const session = buildSession({
        lastSeenAt: new Date(Date.now() - 30 * 60_000), // 30 min ago
      });
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      adminUsersService.findById.mockResolvedValue(buildAdmin());

      await service.validateAndTouch('any-token');

      expect(sessionRepository.touchLastSeen).not.toHaveBeenCalled();
    });

    it('issues the touch DB write when past the throttle window', async () => {
      const session = buildSession({
        lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000), // 2h ago
      });
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      adminUsersService.findById.mockResolvedValue(buildAdmin());

      await service.validateAndTouch('any-token');

      expect(sessionRepository.touchLastSeen).toHaveBeenCalledTimes(1);
    });

    it('rejects sessions past the absolute hard cap', async () => {
      const session = buildSession();
      // Simulate session created 13h ago (absolute TTL is 12h by default).
      (session.get as jest.Mock).mockReturnValue(
        new Date(Date.now() - 13 * 60 * 60_000),
      );
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);

      const result = await service.validateAndTouch('any-token');

      expect(result).toBeNull();
      expect(adminUsersService.findById).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('writes revokedAt = now', async () => {
      await service.revoke('session-id');
      expect(sessionRepository.revoke).toHaveBeenCalledWith(
        'session-id',
        expect.any(Date),
      );
    });
  });
});
