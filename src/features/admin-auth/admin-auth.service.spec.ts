import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as argon2 from 'argon2';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from './admin-users.service';
import { AdminSessionsService } from './admin-sessions.service';
import type { AdminUser } from '@persistence/schemas/admin-user.schema';

const buildAdmin = (overrides: Partial<AdminUser> = {}): AdminUser => {
  const id = new Types.ObjectId();
  return {
    _id: id,
    id: id.toHexString(),
    email: 'admin@example.com',
    passwordHash: 'cached-real-hash',
    displayName: 'Admin',
    status: 'active',
    lastLoginAt: null,
    ...overrides,
  } as unknown as AdminUser;
};

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let adminUsersService: jest.Mocked<AdminUsersService>;
  let adminSessionsService: jest.Mocked<AdminSessionsService>;

  beforeEach(async () => {
    adminUsersService = {
      findByEmailWithPasswordHash: jest.fn(),
      verifyPassword: jest.fn(),
      setLastLoginAt: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<AdminUsersService>;
    adminSessionsService = {
      issue: jest.fn(),
    } as unknown as jest.Mocked<AdminSessionsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: AdminSessionsService, useValue: adminSessionsService },
      ],
    }).compile();

    service = moduleRef.get(AdminAuthService);
  });

  describe('login', () => {
    it('issues a session when credentials are valid', async () => {
      const admin = buildAdmin();
      adminUsersService.findByEmailWithPasswordHash.mockResolvedValue(admin);
      adminUsersService.verifyPassword.mockResolvedValue(true);
      const expiresAt = new Date(Date.now() + 60_000);
      adminSessionsService.issue.mockResolvedValue({
        rawToken: 'raw-token',
        expiresAt,
        session: {} as never,
      });

      const result = await service.login({
        email: 'admin@example.com',
        password: 'correct-pw',
      });

      expect(result.rawToken).toBe('raw-token');
      expect(result.expiresAt).toBe(expiresAt);
      expect(adminSessionsService.issue).toHaveBeenCalledWith({
        adminUserId: admin._id,
        userAgent: null,
        ip: null,
      });
      expect(adminUsersService.setLastLoginAt).toHaveBeenCalledWith(
        admin.id,
        expect.any(Date),
      );
    });

    it('throws Unauthorized for unknown email and still calls verifyPassword for timing parity', async () => {
      adminUsersService.findByEmailWithPasswordHash.mockResolvedValue(null);
      adminUsersService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(adminUsersService.verifyPassword).toHaveBeenCalledTimes(1);
      const [hash, plain] = adminUsersService.verifyPassword.mock.calls[0];
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe('');
      expect(plain).toBe('whatever');
      expect(adminSessionsService.issue).not.toHaveBeenCalled();
    });

    it('throws Unauthorized for disabled admin and still calls verifyPassword for timing parity', async () => {
      const admin = buildAdmin({ status: 'disabled' });
      adminUsersService.findByEmailWithPasswordHash.mockResolvedValue(admin);
      adminUsersService.verifyPassword.mockResolvedValue(true);

      await expect(
        service.login({ email: admin.email, password: 'pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(adminUsersService.verifyPassword).toHaveBeenCalledWith(
        admin.passwordHash,
        'pw',
      );
      expect(adminSessionsService.issue).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when the password is wrong', async () => {
      const admin = buildAdmin();
      adminUsersService.findByEmailWithPasswordHash.mockResolvedValue(admin);
      adminUsersService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: admin.email, password: 'bad-pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(adminSessionsService.issue).not.toHaveBeenCalled();
    });

    it('returns identical 401 message for unknown email vs. wrong password', async () => {
      adminUsersService.findByEmailWithPasswordHash.mockResolvedValueOnce(null);
      adminUsersService.verifyPassword.mockResolvedValue(false);
      const error1 = await service
        .login({ email: 'unknown@x.com', password: 'pw' })
        .catch((e) => e);

      const admin = buildAdmin();
      adminUsersService.findByEmailWithPasswordHash.mockResolvedValueOnce(
        admin,
      );
      adminUsersService.verifyPassword.mockResolvedValue(false);
      const error2 = await service
        .login({ email: admin.email, password: 'bad-pw' })
        .catch((e) => e);

      expect(error1).toBeInstanceOf(UnauthorizedException);
      expect(error2).toBeInstanceOf(UnauthorizedException);
      expect(error1.getResponse()).toEqual(error2.getResponse());
    });
  });

  describe('argon2 dummy hash', () => {
    it('produces a real argon2id hash that argon2.verify accepts', async () => {
      // The dummy hash exists to keep timing constant; smoke-test that the
      // generated value is a valid argon2id encoded string.
      const { getArgon2DummyHash } = await import('./argon2-dummy-hash');
      const hash = await getArgon2DummyHash();
      expect(hash.startsWith('$argon2id$')).toBe(true);
      // argon2.verify must not throw and must return false against a random
      // attacker-supplied password.
      const ok = await argon2.verify(hash, 'attacker-supplied');
      expect(ok).toBe(false);
    });
  });
});
