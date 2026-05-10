import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { ClientAuthGuard } from './client-auth.guard';
import { ClientSessionsService } from './client-sessions.service';
import { CLIENT_SESSION_COOKIE_NAME } from './client-session-cookie-options';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import { IS_CLIENT_AUTH_KEY } from '@shared/decorators/client-auth.decorator';

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

describe('ClientAuthGuard', () => {
  let guard: ClientAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let sessionsService: jest.Mocked<ClientSessionsService>;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    sessionsService = {
      validateAndTouch: jest.fn(),
    } as unknown as jest.Mocked<ClientSessionsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthGuard,
        { provide: Reflector, useValue: reflector },
        { provide: ClientSessionsService, useValue: sessionsService },
      ],
    }).compile();

    guard = moduleRef.get(ClientAuthGuard);
  });

  it('short-circuits and allows when @Public() is set', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    const ctx = buildContext({ cookies: {} });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(sessionsService.validateAndTouch).not.toHaveBeenCalled();
  });

  it('short-circuits and allows when @ClientAuth() is NOT set', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      void key;
      return undefined;
    });
    const ctx = buildContext({ cookies: {} });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(sessionsService.validateAndTouch).not.toHaveBeenCalled();
  });

  it('rejects with 401 when @ClientAuth() is set but no cookie is present', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === IS_CLIENT_AUTH_KEY ? true : undefined,
    );
    const ctx = buildContext({ cookies: {} });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when cookies object is missing entirely', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === IS_CLIENT_AUTH_KEY ? true : undefined,
    );
    const ctx = buildContext({});

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when validateAndTouch returns null', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === IS_CLIENT_AUTH_KEY ? true : undefined,
    );
    sessionsService.validateAndTouch.mockResolvedValue(null);
    const ctx = buildContext({
      cookies: { [CLIENT_SESSION_COOKIE_NAME]: 'token-value' },
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessionsService.validateAndTouch).toHaveBeenCalledWith(
      'token-value',
    );
  });

  it('attaches the client user principal (with clientId) to the request on success', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === IS_CLIENT_AUTH_KEY ? true : undefined,
    );
    const userId = new Types.ObjectId();
    const clientId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    sessionsService.validateAndTouch.mockResolvedValue({
      session: { id: sessionId.toHexString() } as never,
      user: {
        id: userId.toHexString(),
        clientId,
        email: 'user@example.com',
        status: 'active',
        clientRole: 'owner',
      } as never,
    });
    const request: Record<string, unknown> = {
      cookies: { [CLIENT_SESSION_COOKIE_NAME]: 'token-value' },
    };
    const ctx = buildContext(request);

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.clientUser).toEqual({
      userId: userId.toHexString(),
      clientId: clientId.toString(),
      sessionId: sessionId.toHexString(),
      email: 'user@example.com',
      status: 'active',
      clientRole: 'owner',
    });
  });
});
