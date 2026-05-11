import { ADMIN_ROLES, type AdminRole } from './admin-roles';
import { CLIENT_ROLES, type ClientRole } from './client-roles';

/**
 * Static permission map. Single source of truth for derived permissions on
 * both backend (consumed by future service-layer checks if granular checks
 * become necessary) and frontend (mirrored as a TS module on that side).
 *
 * Lockstep regression test (`role-permissions.spec.ts`) asserts every role
 * value in `ADMIN_ROLES` / `CLIENT_ROLES` has an entry here, and that no
 * orphan keys exist. Widening either enum without extending this map fails
 * CI; adding an entry for a non-existent role also fails CI.
 *
 * Permissions are coarse-grained capability strings, NOT route names — they
 * describe what a role can do conceptually. Routes still gate via
 * `@Roles(...)` / `@ClientRoles(...)` decorators on the controller; this map
 * exists for future granular checks and for the frontend to mirror.
 *
 * Forward-only: permission strings, once shipped, may be added but never
 * removed (frontend mirroring depends on stability).
 */
export const ADMIN_ROLE_PERMISSIONS: Readonly<
  Record<AdminRole, ReadonlyArray<string>>
> = Object.freeze({
  super_admin: Object.freeze([
    'admin.read',
    'admin.write',
    'admin.users.manage',
    'admin.billing.manage',
    'admin.system.manage',
  ]),
  support: Object.freeze(['admin.read']),
});

export const CLIENT_ROLE_PERMISSIONS: Readonly<
  Record<ClientRole, ReadonlyArray<string>>
> = Object.freeze({
  owner: Object.freeze([
    'client.read',
    'client.write',
    'client.billing.manage',
    'client.team.manage',
    'client.settings.manage',
  ]),
  operator: Object.freeze(['client.read', 'client.write']),
});

/**
 * Aggregated map for tests/tooling that want a single object keyed by tier.
 */
export const ROLE_PERMISSIONS: Readonly<{
  admin: typeof ADMIN_ROLE_PERMISSIONS;
  client: typeof CLIENT_ROLE_PERMISSIONS;
}> = Object.freeze({
  admin: ADMIN_ROLE_PERMISSIONS,
  client: CLIENT_ROLE_PERMISSIONS,
});

// Re-export for convenience to consumers that only want the enums.
export { ADMIN_ROLES, CLIENT_ROLES };
export type { AdminRole, ClientRole };
