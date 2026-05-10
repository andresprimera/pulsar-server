import { SetMetadata } from '@nestjs/common';
import type { ClientRole } from '@shared/auth/client-roles';

export const CLIENT_ROLES_METADATA_KEY = 'clientRoles';

/**
 * Restricts a client-tier route (must also be `@ClientAuth()`) to the listed
 * client roles. Default-deny applies: a `@ClientAuth()` route without
 * `@ClientRoles(...)` is treated as `@ClientRoles('owner')` by `RolesGuard`.
 *
 * Tier-disjoint with `@Roles(...)`: a single handler MUST NOT carry both
 * decorators.
 */
export const ClientRoles = (
  ...roles: ClientRole[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(CLIENT_ROLES_METADATA_KEY, roles);
