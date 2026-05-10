import 'reflect-metadata';
import { ROLES_METADATA_KEY } from '../../src/shared/decorators/roles.decorator';
import { CLIENT_ROLES_METADATA_KEY } from '../../src/shared/decorators/client-roles.decorator';
import { CONTROLLER_REGISTRY } from './controller-registry';

function readMetadata<T = unknown>(target: object, key: string): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

/**
 * Architecture invariant: a single route handler MUST NOT carry both
 * `@Roles(...)` (admin tier) and `@ClientRoles(...)` (client tier). The
 * tiers are disjoint by design — `@Roles` keys against `request.adminUser`,
 * `@ClientRoles` keys against `request.clientUser`. Mixing them on one
 * handler is incoherent.
 */
describe('Architecture: handlers do not mix admin and client role decorators', () => {
  it('no controller method carries both @Roles and @ClientRoles', () => {
    const offenders: string[] = [];

    for (const Controller of CONTROLLER_REGISTRY) {
      const classAdminRoles = readMetadata(Controller, ROLES_METADATA_KEY);
      const classClientRoles = readMetadata(
        Controller,
        CLIENT_ROLES_METADATA_KEY,
      );
      if (classAdminRoles !== undefined && classClientRoles !== undefined) {
        offenders.push(
          `${Controller.name} (class-level) carries BOTH @Roles and @ClientRoles`,
        );
      }

      const proto = Controller.prototype as Record<string, unknown>;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (n) =>
          n !== 'constructor' &&
          typeof (proto as Record<string, unknown>)[n] === 'function',
      );

      for (const methodName of methodNames) {
        const handler = (proto as Record<string, unknown>)[methodName] as (
          ...args: unknown[]
        ) => unknown;
        const adminRoles = readMetadata(handler, ROLES_METADATA_KEY);
        const clientRoles = readMetadata(handler, CLIENT_ROLES_METADATA_KEY);
        if (adminRoles !== undefined && clientRoles !== undefined) {
          offenders.push(
            `${Controller.name}#${methodName} carries BOTH @Roles and @ClientRoles`,
          );
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Architecture violation: ${
          offenders.length
        } handler(s) mix admin and client role decorators:\n  ${offenders.join(
          '\n  ',
        )}`,
      );
    }
  });
});
