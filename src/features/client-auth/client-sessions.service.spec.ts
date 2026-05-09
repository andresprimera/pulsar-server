import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ClientSessionsService } from './client-sessions.service';
import { ClientUsersService } from './client-users.service';
import { ClientUserSessionRepository } from '@persistence/repositories/client-user-session.repository';
import type { User } from '@persistence/schemas/user.schema';
import type { ClientUserSession } from '@persistence/schemas/client-user-session.schema';

const buildUser = (overrides: Partial<User> = {}): User => {
  const id = new Types.ObjectId();
  return {
    _id: id,
    id: id.toHexString(),
    email: 'user@example.com',
    name: 'User',
    clientId: new Types.ObjectId(),
    status: 'active',
    lastLoginAt: null,
    ...overrides,
  } as unknown as User;
};

const buildSession = (
  overrides: Partial<ClientUserSession> = {},
): ClientUserSession => {
  const id = new Types.ObjectId();
  const now = Date.now();
  const createdAt = new Date(now - 60_000);
  return {
    _id: id,
    id: id.toHexString(),
    userId: new Types.ObjectId(),
    clientId: new Types.ObjectId(),
    tokenHash: 'hash',
    expiresAt: new Date(now + 30 * 60_000),
    lastSeenAt: new Date(now - 1_000),
    revokedAt: null,
    userAgent: null,
    ip: null,
    get: jest.fn().mockReturnValue(createdAt),
    ...overrides,
  } as unknown as ClientUserSession;
};

describe('ClientSessionsService', () => {
  let service: ClientSessionsService;
  let sessionRepository: jest.Mocked<ClientUserSessionRepository>;
  let clientUsersService: jest.Mocked<ClientUsersService>;

  beforeEach(async () => {
    sessionRepository = {
      create: jest.fn(),
      findActiveByTokenHash: jest.fn(),
      touchLastSeen: jest.fn().mockResolvedValue(undefined),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ClientUserSessionRepository>;
    clientUsersService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<ClientUsersService>;
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientSessionsService,
        {
          provide: ClientUserSessionRepository,
          useValue: sessionRepository,
        },
        { provide: ClientUsersService, useValue: clientUsersService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(ClientSessionsService);
  });

  describe('issue', () => {
    it('returns a fresh raw token and persists the session with userId+clientId', async () => {
      const userId = new Types.ObjectId();
      const clientId = new Types.ObjectId();
      const session = buildSession({ userId, clientId });
      sessionRepository.create.mockResolvedValue(session);

      const result = await service.issue({ userId, clientId });

      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken.length).toBeGreaterThan(0);
      expect(sessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          clientId,
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
      const a = await service.issue({
        userId: new Types.ObjectId(),
        clientId: new Types.ObjectId(),
      });
      const b = await service.issue({
        userId: new Types.ObjectId(),
        clientId: new Types.ObjectId(),
      });
      expect(a.rawToken).not.toBe(b.rawToken);
    });
  });

  describe('validateAndTouch', () => {
    it('returns null when no active session matches the token hash', async () => {
      sessionRepository.findActiveByTokenHash.mockResolvedValue(null);
      expect(await service.validateAndTouch('any-token')).toBeNull();
    });

    it('returns null and revokes the session when the user is non-active', async () => {
      const session = buildSession();
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      clientUsersService.findById.mockResolvedValue(
        buildUser({ status: 'inactive' }),
      );

      const result = await service.validateAndTouch('any-token');

      expect(result).toBeNull();
      expect(sessionRepository.revoke).toHaveBeenCalledWith(
        session.id,
        expect.any(Date),
      );
    });

    it('returns null when the user is missing', async () => {
      const session = buildSession();
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      clientUsersService.findById.mockResolvedValue(null);

      const result = await service.validateAndTouch('any-token');

      expect(result).toBeNull();
      expect(sessionRepository.revoke).toHaveBeenCalled();
    });

    it('returns the validated session and user on success', async () => {
      const session = buildSession();
      const user = buildUser();
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      clientUsersService.findById.mockResolvedValue(user);

      const result = await service.validateAndTouch('any-token');

      expect(result).not.toBeNull();
      expect(result?.session).toBe(session);
      expect(result?.user).toBe(user);
    });

    it('skips the touch DB write when within the throttle window', async () => {
      const session = buildSession({
        lastSeenAt: new Date(Date.now() - 30 * 60_000),
      });
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      clientUsersService.findById.mockResolvedValue(buildUser());

      await service.validateAndTouch('any-token');

      expect(sessionRepository.touchLastSeen).not.toHaveBeenCalled();
    });

    it('issues the touch DB write when past the throttle window', async () => {
      const session = buildSession({
        lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000),
      });
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);
      clientUsersService.findById.mockResolvedValue(buildUser());

      await service.validateAndTouch('any-token');

      expect(sessionRepository.touchLastSeen).toHaveBeenCalledTimes(1);
    });

    it('rejects sessions past the absolute hard cap', async () => {
      const session = buildSession();
      (session.get as jest.Mock).mockReturnValue(
        new Date(Date.now() - 13 * 60 * 60_000),
      );
      sessionRepository.findActiveByTokenHash.mockResolvedValue(session);

      const result = await service.validateAndTouch('any-token');

      expect(result).toBeNull();
      expect(clientUsersService.findById).not.toHaveBeenCalled();
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

  describe('revokeAllForUser', () => {
    it('revokes all sessions for the supplied user id', async () => {
      const userId = new Types.ObjectId();
      await service.revokeAllForUser(userId);
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(
        userId,
        expect.any(Date),
      );
    });
  });

  describe('getAbsoluteTtlMs', () => {
    it('returns the configured absolute TTL', () => {
      expect(service.getAbsoluteTtlMs()).toBe(12 * 60 * 60 * 1000);
    });
  });
});
