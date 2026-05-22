/**
 * Lead lifecycle states. Shared so persistence schemas, domain rules, and
 * feature DTOs use the same enum literals without crossing into `@domain/`
 * (DTOs MUST NOT import `@domain/*`).
 *
 * Forward-only per `docs/rules/data-modeling.md` §"Forward-only enum
 * evolution" — values may be added but never removed.
 */
export const LEAD_STATES = [
  'new',
  'in_progress',
  'qualified',
  'disqualified',
  'dormant',
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

export function isLeadState(value: string): value is LeadState {
  return (LEAD_STATES as readonly string[]).includes(value);
}
