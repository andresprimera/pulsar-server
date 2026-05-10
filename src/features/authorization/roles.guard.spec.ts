import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import { IS_CLIENT_AUTH_KEY } from '@shared/decorators/client-auth.decorator';
import { ROLES_METADATA_KEY } from '@shared/decorators/roles.decorator';
import { CLIENT_ROLES_METADATA_KEY } from '@shared/decorators/client-roles.decorator';

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

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: reflector }],
    }).compile();

    guard = moduleRef.get(RolesGuard);
  });

  describe('public routes', () => {
    it('short-circuits and allows when @Public() is set', () => {
      reflector.getAllAndOverride.mockImplementation((key) =>
        key === IS_PUBLIC_KEY ? true : undefined,
      );
      const ctx = buildContext({});

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('admin tier (default-deny → super_admin)', () => {
    it('allows super_admin when no @Roles() is set', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return undefined;
        if (key === ROLES_METADATA_KEY) return undefined;
        return undefined;
      });
      const ctx = buildContext({
        adminUser: { role: 'super_admin' },
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rejects support when no @Roles() is set (default-deny → super_admin)', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return undefined;
        if (key === ROLES_METADATA_KEY) return undefined;
        return undefined;
      });
      const ctx = buildContext({
        adminUser: { role: 'support' },
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows support when @Roles("super_admin", "support") is set', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return undefined;
        if (key === ROLES_METADATA_KEY) return ['super_admin', 'support'];
        return undefined;
      });
      const ctx = buildContext({
        adminUser: { role: 'support' },
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rejects an unknown role string', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return undefined;
        if (key === ROLES_METADATA_KEY) return ['super_admin'];
        return undefined;
      });
      const ctx = buildContext({
        adminUser: { role: 'auditor' },
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('rejects when admin principal is missing (defense-in-depth)', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return undefined;
        if (key === ROLES_METADATA_KEY) return undefined;
        return undefined;
      });
      const ctx = buildContext({});

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('client tier (default-deny → owner)', () => {
    it('allows owner when no @ClientRoles() is set', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return true;
        if (key === CLIENT_ROLES_METADATA_KEY) return undefined;
        return undefined;
      });
      const ctx = buildContext({
        clientUser: { clientRole: 'owner' },
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rejects operator when no @ClientRoles() is set (default-deny → owner)', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return true;
        if (key === CLIENT_ROLES_METADATA_KEY) return undefined;
        return undefined;
      });
      const ctx = buildContext({
        clientUser: { clientRole: 'operator' },
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows operator when @ClientRoles("owner", "operator") is set', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return true;
        if (key === CLIENT_ROLES_METADATA_KEY) return ['owner', 'operator'];
        return undefined;
      });
      const ctx = buildContext({
        clientUser: { clientRole: 'operator' },
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rejects when client principal is missing (defense-in-depth)', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return true;
        if (key === CLIENT_ROLES_METADATA_KEY) return undefined;
        return undefined;
      });
      const ctx = buildContext({});

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('handler overrides class-level (Reflector.getAllAndOverride)', () => {
    it('uses handler-level @Roles when both class and handler set it', () => {
      // The Reflector mock returns the merged result of getAllAndOverride;
      // here we simulate "handler wins" by returning the handler value.
      reflector.getAllAndOverride.mockImplementation((key, targets) => {
        if (key === IS_PUBLIC_KEY) return undefined;
        if (key === IS_CLIENT_AUTH_KEY) return undefined;
        if (key === ROLES_METADATA_KEY) {
          // assert the guard passed [handler, class] in that order
          expect(Array.isArray(targets)).toBe(true);
          expect(targets).toHaveLength(2);
          // simulate handler-level value winning
          return ['super_admin', 'support'];
        }
        return undefined;
      });
      const ctx = buildContext({
        adminUser: { role: 'support' },
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
