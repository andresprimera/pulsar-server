import type { AgentKind } from '@shared/agent-kind.constants';

/**
 * Embedded agent reference inside `ClientAgentSummaryForClientDto`.
 *
 * Single editing point for the agent sub-shape so future evolution
 * (renames, additions) updates one place. Status is narrowed to the
 * literal union — mirrors `AgentSummary.status` precision from the
 * admin DTO.
 */
export interface ClientAgentSummaryForClientAgentRef {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
  kind: AgentKind;
}

/**
 * Client-tier wire shape for `GET /client-agents/me` (agent picker).
 *
 * Uses `id` (not `_id`) deliberately — this is the client-facing wire
 * contract and mirrors the frontend's `ClientAgentSummaryForClient`
 * interface. Do not "normalize" to `_id` to match the admin DTO.
 *
 * The mapper (`ClientAgentsService.toClientSummary`) is the single
 * point that performs the `_id → id` rename and the field-by-field
 * whitelist copy. Never widen this shape by row spread.
 */
export class ClientAgentSummaryForClientDto {
  id!: string;
  status!: 'active' | 'inactive' | 'archived';
  agent!: ClientAgentSummaryForClientAgentRef | null;
}
