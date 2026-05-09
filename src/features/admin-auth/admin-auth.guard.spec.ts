import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminSessionsService } from './admin-sessions.service';
import { ADMIN_SESSION_COOKIE_NAME } from './session-cookie-options';

const buildContext = (request: Record<string, unknown>): ExecutionContext => {
  const handler = jest.fn();
  const cls = jest.fn();
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
};

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let sessionsService: jest.Mocked<AdminSessionsService>;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    sessionsService = {
      validateAndTouch: jest.fn(),
    } as unknown as jest.Mocked<AdminSessionsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthGuard,
        { provide: Reflector, useValue: reflector },
        { provide: AdminSessionsService, useValue: sessionsService },
      ],
    }).compile();

    guard = moduleRef.get(AdminAuthGuard);
  });

  it('short-circuits and allows when @Public() is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = buildContext({ cookies: {} });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(sessionsService.validateAndTouch).not.toHaveBeenCalled();
  });

  it('rejects with 401 when no cookie is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({ cookies: {} });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when cookies object is missing entirely', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({});

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when validateAndTouch returns null', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    sessionsService.validateAndTouch.mockResolvedValue(null);
    const ctx = buildContext({
      cookies: { [ADMIN_SESSION_COOKIE_NAME]: 'token-value' },
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessionsService.validateAndTouch).toHaveBeenCalledWith(
      'token-value',
    );
  });

  it('attaches the admin principal to the request on success', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const adminId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    sessionsService.validateAndTouch.mockResolvedValue({
      session: { id: sessionId.toHexString() } as never,
      admin: {
        id: adminId.toHexString(),
        email: 'admin@example.com',
        status: 'active',
      } as never,
    });
    const request: Record<string, unknown> = {
      cookies: { [ADMIN_SESSION_COOKIE_NAME]: 'token-value' },
    };
    const ctx = buildContext(request);

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.adminUser).toEqual({
      adminUserId: adminId.toHexString(),
      sessionId: sessionId.toHexString(),
      email: 'admin@example.com',
      status: 'active',
    });
  });
});
