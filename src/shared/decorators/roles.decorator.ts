import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@shared/auth/admin-roles';

export const ROLES_METADATA_KEY = 'adminRoles';

/**
 * Restricts an admin-tier route to the listed admin roles. Default-deny
 * applies: an admin route without `@Roles(...)` is treated as
 * `@Roles('super_admin')` by `RolesGuard`.
 *
 * Tier-disjoint with `@ClientRoles(...)`: a single handler MUST NOT carry
 * both decorators. The architecture test
 * `decorator-tier-disjointness.spec.ts` enforces this in CI.
 */
export const Roles = (
  ...roles: AdminRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_METADATA_KEY, roles);
