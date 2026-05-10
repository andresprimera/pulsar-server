/**
 * Client tier role enum. Forward-only per docs/rules/data-modeling.md
 * §"Forward-only enum evolution" — values may be added but never removed.
 *
 * - `owner`: privileged seat (billing, team, settings, full ops).
 * - `operator`: day-to-day product use; cannot change billing, team, or
 *   destructive settings.
 *
 * Default-deny: a `@ClientAuth()` route without an explicit `@ClientRoles(...)`
 * decorator is treated as `@ClientRoles('owner')` by `RolesGuard`.
 */
export const CLIENT_ROLES = ['owner', 'operator'] as const;

export type ClientRole = (typeof CLIENT_ROLES)[number];
