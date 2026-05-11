/**
 * Agent kinds. Catalog discriminator used by the frontend to drive
 * per-agent sidebar nav. Shared so persistence schemas and DTOs use the
 * same enum literals without crossing into `@features/`.
 *
 * Forward-only per `docs/rules/data-modeling.md` §"Forward-only enum
 * evolution" — values may be added but never removed.
 */
export const AGENT_KINDS = ['customer_service', 'sales'] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export function isAgentKind(value: string): value is AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(value);
}
