import type { LeadState } from '@shared/lead-state.constants';

/**
 * Wire-shape for a single lead row. Mirrors persistence projection without
 * importing any `@domain/*` or `@persistence/*` types — DTOs are pure
 * presentation contracts.
 *
 * `LeadFields` is intentionally inlined here (rather than imported from
 * `@domain/leads/*`) so this DTO can live in `features/` without crossing
 * layer boundaries.
 */
export interface LeadSummaryFields {
  budget?: {
    amount?: number;
    currency?: string;
  };
  intent?: string;
  timeline?: {
    horizon?: string;
  };
  notes?: string[];
  contactPreferences?: {
    preferredChannel?: string;
    preferredTime?: string;
  };
}

export class LeadSummaryDto {
  id!: string;
  clientId!: string;
  agentId!: string;
  contactId!: string;
  conversationId!: string;
  state!: LeadState;
  fields!: LeadSummaryFields;
  lastQualificationAt?: string;
  createdAt!: string;
  updatedAt!: string;
}
