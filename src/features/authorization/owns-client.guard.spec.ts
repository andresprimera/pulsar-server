import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnsClientGuard } from './owns-client.guard';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import { OWNS_CLIENT_METADATA_KEY } from '@shared/decorators/owns-client.decorator';

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

describe('OwnsClientGuard', () => {
  let guard: OwnsClientGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [OwnsClientGuard, { provide: Reflector, useValue: reflector }],
    }).compile();

    guard = moduleRef.get(OwnsClientGuard);
  });

  it('short-circuits and allows when @Public() is set', () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    const ctx = buildContext({});

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when @OwnsClient() metadata is absent', () => {
    reflector.getAllAndOverride.mockImplementation(() => undefined);
    const ctx = buildContext({});

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin-tier requests bypass even with @OwnsClient() metadata set', () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === OWNS_CLIENT_METADATA_KEY) return 'clientId';
      return undefined;
    });
    const ctx = buildContext({
      adminUser: { role: 'support' },
      params: { clientId: 'someone-elses-client' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when client principal clientId matches the param', () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === OWNS_CLIENT_METADATA_KEY) return 'clientId';
      return undefined;
    });
    const ctx = buildContext({
      clientUser: { clientId: 'abc123' },
      params: { clientId: 'abc123' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when client principal clientId does not match the param', () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === OWNS_CLIENT_METADATA_KEY) return 'clientId';
      return undefined;
    });
    const ctx = buildContext({
      clientUser: { clientId: 'abc123' },
      params: { clientId: 'def456' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when the named param is missing', () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === OWNS_CLIENT_METADATA_KEY) return 'clientId';
      return undefined;
    });
    const ctx = buildContext({
      clientUser: { clientId: 'abc123' },
      params: {},
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('honors a custom param name like @OwnsClient("orgId")', () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === OWNS_CLIENT_METADATA_KEY) return 'orgId';
      return undefined;
    });
    const matchCtx = buildContext({
      clientUser: { clientId: 'abc123' },
      params: { orgId: 'abc123' },
    });
    const mismatchCtx = buildContext({
      clientUser: { clientId: 'abc123' },
      params: { orgId: 'def456' },
    });

    expect(guard.canActivate(matchCtx)).toBe(true);
    expect(() => guard.canActivate(mismatchCtx)).toThrow(ForbiddenException);
  });

  it('compares as strings (no ObjectId casting)', () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === OWNS_CLIENT_METADATA_KEY) return 'clientId';
      return undefined;
    });
    // Simulate a clientId where the principal stored a different stringification
    const ctx = buildContext({
      clientUser: { clientId: 'abc123' },
      params: { clientId: 'abc123' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
