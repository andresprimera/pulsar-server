import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request, Response } from 'express';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionsService } from './admin-sessions.service';
import { ADMIN_SESSION_COOKIE_NAME } from './session-cookie-options';
import type { AdminUser } from '@persistence/schemas/admin-user.schema';
import type { AdminPrincipal } from '@shared/types/express';

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

const buildResponse = (): jest.Mocked<Response> => {
  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as jest.Mocked<Response>;
  return res;
};

const buildRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    ip: '1.2.3.4',
    ...overrides,
  } as unknown as Request);

describe('AdminAuthController', () => {
  let controller: AdminAuthController;
  let adminAuthService: jest.Mocked<AdminAuthService>;
  let adminSessionsService: jest.Mocked<AdminSessionsService>;

  beforeEach(async () => {
    adminAuthService = {
      login: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
    } as unknown as jest.Mocked<AdminAuthService>;
    adminSessionsService = {
      getAbsoluteTtlMs: jest.fn().mockReturnValue(12 * 60 * 60 * 1000),
    } as unknown as jest.Mocked<AdminSessionsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [
        { provide: AdminAuthService, useValue: adminAuthService },
        { provide: AdminSessionsService, useValue: adminSessionsService },
      ],
    }).compile();

    controller = moduleRef.get(AdminAuthController);
  });

  describe('login', () => {
    it('forwards user-agent + ip and sets the session cookie with maxAge from the service', async () => {
      const admin = buildAdmin();
      adminAuthService.login.mockResolvedValue({
        rawToken: 'raw-token',
        expiresAt: new Date(),
        admin,
      });
      const request = buildRequest({
        headers: { 'user-agent': 'Mozilla/5.0' } as never,
      });
      const response = buildResponse();

      const result = await controller.login(
        { email: 'admin@example.com', password: 'pw' },
        request,
        response,
      );

      expect(adminAuthService.login).toHaveBeenCalledWith({
        email: 'admin@example.com',
        password: 'pw',
        userAgent: 'Mozilla/5.0',
        ip: '1.2.3.4',
      });
      expect(response.cookie).toHaveBeenCalledWith(
        ADMIN_SESSION_COOKIE_NAME,
        'raw-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 12 * 60 * 60 * 1000,
        }),
      );
      expect(result.principal.kind).toBe('admin');
      expect(result.principal.id).toBe(admin.id);
      expect(result.principal.email).toBe(admin.email);
      expect(result.principal.displayName).toBe(admin.displayName);
      expect(result.principal.status).toBe('active');
      expect(result.principal.lastLoginAt).toBeNull();
      expect('clientId' in result.principal).toBe(false);
    });
  });

  describe('logout', () => {
    it('revokes the session and defensively clears the cookie', async () => {
      const principal: AdminPrincipal = {
        adminUserId: 'a',
        sessionId: 'session-id',
        email: 'admin@example.com',
        status: 'active',
      };
      const response = buildResponse();

      await controller.logout(principal, response);

      expect(adminAuthService.logout).toHaveBeenCalledWith('session-id');
      expect(response.clearCookie).toHaveBeenCalledWith(
        ADMIN_SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        ADMIN_SESSION_COOKIE_NAME,
        '',
        expect.objectContaining({
          expires: new Date(0),
          maxAge: 0,
        }),
      );
    });

    it('skips logout call when principal is undefined but still clears cookie', async () => {
      const response = buildResponse();

      await controller.logout(undefined, response);

      expect(adminAuthService.logout).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('throws 401 when principal is undefined', async () => {
      await expect(controller.me(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 401 when fresh admin is null', async () => {
      adminAuthService.getMe.mockResolvedValue(null);

      await expect(
        controller.me({
          adminUserId: 'a',
          sessionId: 's',
          email: 'admin@example.com',
          status: 'active',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the fresh admin response', async () => {
      const admin = buildAdmin();
      adminAuthService.getMe.mockResolvedValue(admin);

      const result = await controller.me({
        adminUserId: admin.id,
        sessionId: 's',
        email: admin.email,
        status: 'active',
      });

      expect(adminAuthService.getMe).toHaveBeenCalledWith(admin.id);
      expect(result.principal.kind).toBe('admin');
      expect(result.principal.id).toBe(admin.id);
      expect(result.principal.email).toBe(admin.email);
      expect(result.principal.displayName).toBe(admin.displayName);
      expect(result.principal.status).toBe('active');
      expect(result.principal.lastLoginAt).toBeNull();
      expect('clientId' in result.principal).toBe(false);
    });
  });
});
