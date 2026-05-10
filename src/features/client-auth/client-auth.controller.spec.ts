import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request, Response } from 'express';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientSessionsService } from './client-sessions.service';
import { CLIENT_SESSION_COOKIE_NAME } from './client-session-cookie-options';
import type { User } from '@persistence/schemas/user.schema';
import type { ClientUserPrincipal } from '@shared/types/express';

const buildUser = (overrides: Partial<User> = {}): User => {
  const id = new Types.ObjectId();
  return {
    _id: id,
    id: id.toHexString(),
    email: 'user@example.com',
    name: 'User',
    clientId: new Types.ObjectId(),
    status: 'active',
    clientRole: 'owner',
    lastLoginAt: null,
    ...overrides,
  } as unknown as User;
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

describe('ClientAuthController', () => {
  let controller: ClientAuthController;
  let clientAuthService: jest.Mocked<ClientAuthService>;
  let clientSessionsService: jest.Mocked<ClientSessionsService>;

  beforeEach(async () => {
    clientAuthService = {
      login: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
    } as unknown as jest.Mocked<ClientAuthService>;
    clientSessionsService = {
      getAbsoluteTtlMs: jest.fn().mockReturnValue(12 * 60 * 60 * 1000),
    } as unknown as jest.Mocked<ClientSessionsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ClientAuthController],
      providers: [
        { provide: ClientAuthService, useValue: clientAuthService },
        { provide: ClientSessionsService, useValue: clientSessionsService },
      ],
    }).compile();

    controller = moduleRef.get(ClientAuthController);
  });

  describe('login', () => {
    it('forwards user-agent + ip and sets the session cookie with maxAge from the service', async () => {
      const user = buildUser();
      clientAuthService.login.mockResolvedValue({
        rawToken: 'raw-token',
        expiresAt: new Date(),
        user,
      });
      const request = buildRequest({
        headers: { 'user-agent': 'Mozilla/5.0' } as never,
      });
      const response = buildResponse();

      const result = await controller.login(
        { email: 'user@example.com', password: 'pw' },
        request,
        response,
      );

      expect(clientAuthService.login).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'pw',
        userAgent: 'Mozilla/5.0',
        ip: '1.2.3.4',
      });
      expect(response.cookie).toHaveBeenCalledWith(
        CLIENT_SESSION_COOKIE_NAME,
        'raw-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 12 * 60 * 60 * 1000,
        }),
      );
      expect(result.principal.kind).toBe('clientUser');
      expect(result.principal.email).toBe(user.email);
      expect(result.principal.clientId).toBe(user.clientId.toString());
      expect(result.principal.displayName).toBe(user.name);
    });
  });

  describe('logout', () => {
    it('revokes the session and defensively clears the cookie', async () => {
      const principal: ClientUserPrincipal = {
        userId: 'u',
        clientId: 'c',
        sessionId: 'session-id',
        email: 'user@example.com',
        status: 'active',
        clientRole: 'owner',
      };
      const response = buildResponse();

      await controller.logout(principal, response);

      expect(clientAuthService.logout).toHaveBeenCalledWith('session-id');
      expect(response.clearCookie).toHaveBeenCalledWith(
        CLIENT_SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        CLIENT_SESSION_COOKIE_NAME,
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

      expect(clientAuthService.logout).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('throws 401 when principal is undefined', async () => {
      await expect(controller.me(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 401 when fresh user is null', async () => {
      clientAuthService.getMe.mockResolvedValue(null);

      await expect(
        controller.me({
          userId: 'u',
          clientId: 'c',
          sessionId: 's',
          email: 'e',
          status: 'active',
          clientRole: 'owner',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when fresh user status is not active', async () => {
      clientAuthService.getMe.mockResolvedValue(
        buildUser({ status: 'inactive' }),
      );

      await expect(
        controller.me({
          userId: 'u',
          clientId: 'c',
          sessionId: 's',
          email: 'e',
          status: 'active',
          clientRole: 'owner',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the fresh user response when active', async () => {
      const user = buildUser();
      clientAuthService.getMe.mockResolvedValue(user);

      const result = await controller.me({
        userId: user.id,
        clientId: user.clientId.toString(),
        sessionId: 's',
        email: user.email,
        status: 'active',
        clientRole: 'owner',
      });

      expect(clientAuthService.getMe).toHaveBeenCalledWith(user.id);
      expect(result.principal.kind).toBe('clientUser');
      expect(result.principal.email).toBe(user.email);
      expect(result.principal.status).toBe('active');
      expect(result.principal.clientRole).toBe('owner');
      expect(result.principal.displayName).toBe(user.name);
    });
  });
});
