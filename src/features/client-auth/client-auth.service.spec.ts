import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as argon2 from 'argon2';
import { ClientAuthService } from './client-auth.service';
import { ClientUsersService } from './client-users.service';
import { ClientSessionsService } from './client-sessions.service';
import type { User } from '@persistence/schemas/user.schema';

const buildUser = (overrides: Partial<User> = {}): User => {
  const id = new Types.ObjectId();
  return {
    _id: id,
    id: id.toHexString(),
    email: 'user@example.com',
    name: 'User',
    clientId: new Types.ObjectId(),
    passwordHash: 'cached-real-hash',
    status: 'active',
    lastLoginAt: null,
    ...overrides,
  } as unknown as User;
};

describe('ClientAuthService', () => {
  let service: ClientAuthService;
  let clientUsersService: jest.Mocked<ClientUsersService>;
  let clientSessionsService: jest.Mocked<ClientSessionsService>;

  beforeEach(async () => {
    clientUsersService = {
      findByEmailWithPasswordHash: jest.fn(),
      verifyPassword: jest.fn(),
      setLastLoginAt: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ClientUsersService>;
    clientSessionsService = {
      issue: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<ClientSessionsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        { provide: ClientUsersService, useValue: clientUsersService },
        { provide: ClientSessionsService, useValue: clientSessionsService },
      ],
    }).compile();

    service = moduleRef.get(ClientAuthService);
  });

  describe('login', () => {
    it('issues a session when credentials are valid', async () => {
      const user = buildUser();
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValue(user);
      clientUsersService.verifyPassword.mockResolvedValue(true);
      const expiresAt = new Date(Date.now() + 60_000);
      clientSessionsService.issue.mockResolvedValue({
        rawToken: 'raw-token',
        expiresAt,
        session: {} as never,
      });

      const result = await service.login({
        email: 'user@example.com',
        password: 'correct-pw',
      });

      expect(result.rawToken).toBe('raw-token');
      expect(result.expiresAt).toBe(expiresAt);
      expect(clientSessionsService.issue).toHaveBeenCalledWith({
        userId: user._id,
        clientId: user.clientId,
        userAgent: null,
        ip: null,
      });
      expect(clientUsersService.setLastLoginAt).toHaveBeenCalledWith(
        user.id,
        expect.any(Date),
      );
    });

    it('throws Unauthorized for unknown email and still calls verifyPassword for timing parity', async () => {
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValue(null);
      clientUsersService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(clientUsersService.verifyPassword).toHaveBeenCalledTimes(1);
      const [hash, plain] = clientUsersService.verifyPassword.mock.calls[0];
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe('');
      expect(plain).toBe('whatever');
      expect(clientSessionsService.issue).not.toHaveBeenCalled();
    });

    it('throws Unauthorized for legacy user (no passwordHash) and runs dummy verify for timing parity', async () => {
      const user = buildUser({ passwordHash: undefined });
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValue(user);
      clientUsersService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: user.email, password: 'pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(clientUsersService.verifyPassword).toHaveBeenCalledTimes(1);
      const [hash] = clientUsersService.verifyPassword.mock.calls[0];
      expect(hash).not.toBe(user.passwordHash);
      expect(clientSessionsService.issue).not.toHaveBeenCalled();
    });

    it('throws Unauthorized for non-active user and still calls verifyPassword against real hash', async () => {
      const user = buildUser({ status: 'inactive' });
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValue(user);
      clientUsersService.verifyPassword.mockResolvedValue(true);

      await expect(
        service.login({ email: user.email, password: 'pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(clientUsersService.verifyPassword).toHaveBeenCalledWith(
        user.passwordHash,
        'pw',
      );
      expect(clientSessionsService.issue).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when the password is wrong', async () => {
      const user = buildUser();
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValue(user);
      clientUsersService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: user.email, password: 'bad-pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(clientSessionsService.issue).not.toHaveBeenCalled();
    });

    it('returns identical 401 message for all four failure branches', async () => {
      // Unknown email
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValueOnce(
        null,
      );
      clientUsersService.verifyPassword.mockResolvedValue(false);
      const e1 = await service
        .login({ email: 'unknown@x.com', password: 'pw' })
        .catch((e) => e);

      // Legacy user (no passwordHash)
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValueOnce(
        buildUser({ passwordHash: undefined }),
      );
      const e2 = await service
        .login({ email: 'legacy@x.com', password: 'pw' })
        .catch((e) => e);

      // Non-active
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValueOnce(
        buildUser({ status: 'archived' }),
      );
      const e3 = await service
        .login({ email: 'archived@x.com', password: 'pw' })
        .catch((e) => e);

      // Wrong password
      clientUsersService.findByEmailWithPasswordHash.mockResolvedValueOnce(
        buildUser(),
      );
      clientUsersService.verifyPassword.mockResolvedValue(false);
      const e4 = await service
        .login({ email: 'real@x.com', password: 'bad' })
        .catch((e) => e);

      for (const err of [e1, e2, e3, e4]) {
        expect(err).toBeInstanceOf(UnauthorizedException);
      }
      expect(e1.getResponse()).toEqual(e2.getResponse());
      expect(e1.getResponse()).toEqual(e3.getResponse());
      expect(e1.getResponse()).toEqual(e4.getResponse());
    });
  });

  describe('logout', () => {
    it('revokes the supplied session id', async () => {
      await service.logout('session-1');
      expect(clientSessionsService.revoke).toHaveBeenCalledWith('session-1');
    });
  });

  describe('getMe', () => {
    it('delegates to clientUsersService.findById', async () => {
      const user = buildUser();
      clientUsersService.findById.mockResolvedValue(user);
      expect(await service.getMe('user-1')).toBe(user);
      expect(clientUsersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('argon2 dummy hash', () => {
    it('produces a real argon2id hash that argon2.verify accepts', async () => {
      const { getArgon2DummyHash } = await import('./argon2-dummy-hash');
      const hash = await getArgon2DummyHash();
      expect(hash.startsWith('$argon2id$')).toBe(true);
      const ok = await argon2.verify(hash, 'attacker-supplied');
      expect(ok).toBe(false);
    });
  });
});
