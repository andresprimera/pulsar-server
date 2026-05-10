/**
 * Admin tier role enum. Forward-only per docs/rules/data-modeling.md
 * §"Forward-only enum evolution" — values may be added but never removed.
 *
 * - `super_admin`: full administrative access; only role with privileged
 *   write/mutation capability across the admin surface.
 * - `support`: limited operational access; can reach routes that explicitly
 *   opt-in via `@Roles('super_admin', 'support')`.
 *
 * Default-deny: an admin route without an explicit `@Roles(...)` decorator
 * is treated as `@Roles('super_admin')` by `RolesGuard`.
 */
export const ADMIN_ROLES = ['super_admin', 'support'] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
