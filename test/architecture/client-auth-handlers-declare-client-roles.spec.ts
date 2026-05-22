import 'reflect-metadata';
import { IS_CLIENT_AUTH_KEY } from '../../src/shared/decorators/client-auth.decorator';
import { CLIENT_ROLES_METADATA_KEY } from '../../src/shared/decorators/client-roles.decorator';
import {
  CLIENT_ROLES,
  type ClientRole,
} from '../../src/shared/auth/client-roles';
import { ClientAuthController } from '../../src/features/client-auth/client-auth.controller';

/**
 * Architecture invariant SCOPED to `ClientAuthController`.
 *
 * Why scoped: `RolesGuard` defaults the allowed-roles list to `['owner']`
 * for client-tier handlers that omit `@ClientRoles(...)`. That fail-closed
 * default is correct, but it produced an operator-lockout incident on
 * `/client-auth/me`. To prevent recurrence on this controller specifically
 * (which is the boot-time session-resolution surface that the frontend
 * `ClientLayout` calls on every navigation), every `@ClientAuth()` handler
 * on `ClientAuthController` MUST declare its allowed roles explicitly.
 *
 * The broader sweep (extend this invariant to every `@ClientAuth()`
 * handler in `CONTROLLER_REGISTRY`) is a tracked follow-up — not in scope
 * here per the requirement that introduced this spec.
 *
 * Dev rehearsal (one-time smoke-test that the spec actually guards):
 *   - Temporarily remove `@ClientRoles('owner', 'operator')` from either
 *     `me` or `logout` in `client-auth.controller.ts`.
 *   - Run `pnpm test test/architecture/client-auth-handlers-declare-client-roles.spec.ts`.
 *   - Confirm assertion A1 fails with a message naming
 *     `ClientAuthController#<methodName>`.
 *   - Restore the decorator. Do NOT commit the rehearsal.
 */
describe('Architecture: ClientAuthController handlers declare @ClientRoles', () => {
  const proto = ClientAuthController.prototype as unknown as Record<
    string,
    unknown
  >;
  const methodNames = Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof (proto as Record<string, unknown>)[name] === 'function',
  );

  it('A1: every @ClientAuth() handler on ClientAuthController declares a non-empty @ClientRoles(...)', () => {
    const offenders: string[] = [];

    for (const methodName of methodNames) {
      const handler = (proto as Record<string, unknown>)[methodName] as (
        ...args: unknown[]
      ) => unknown;

      const isClientAuth = Reflect.getMetadata(IS_CLIENT_AUTH_KEY, handler) as
        | boolean
        | undefined;
      if (isClientAuth !== true) continue;

      const roles = Reflect.getMetadata(CLIENT_ROLES_METADATA_KEY, handler) as
        | readonly ClientRole[]
        | undefined;
      if (roles === undefined || roles.length === 0) {
        offenders.push(
          `ClientAuthController#${methodName} is @ClientAuth() but missing or empty @ClientRoles(...)`,
        );
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Architecture violation: ${
          offenders.length
        } ClientAuthController handler(s) lack explicit @ClientRoles(...):\n  ${offenders.join(
          '\n  ',
        )}`,
      );
    }
  });

  it('A2: declared roles are a non-empty subset of CLIENT_ROLES', () => {
    const allowed = new Set<ClientRole>(CLIENT_ROLES);
    const offenders: string[] = [];

    for (const methodName of methodNames) {
      const handler = (proto as Record<string, unknown>)[methodName] as (
        ...args: unknown[]
      ) => unknown;
      const isClientAuth = Reflect.getMetadata(IS_CLIENT_AUTH_KEY, handler) as
        | boolean
        | undefined;
      if (isClientAuth !== true) continue;

      const roles = Reflect.getMetadata(CLIENT_ROLES_METADATA_KEY, handler) as
        | readonly string[]
        | undefined;
      if (roles === undefined || roles.length === 0) continue;

      for (const role of roles) {
        if (!allowed.has(role as ClientRole)) {
          offenders.push(
            `ClientAuthController#${methodName} declares unknown role "${role}"`,
          );
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Architecture violation: ${
          offenders.length
        } ClientAuthController handler(s) declare unknown roles:\n  ${offenders.join(
          '\n  ',
        )}`,
      );
    }
  });
});
