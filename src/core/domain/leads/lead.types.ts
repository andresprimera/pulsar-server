/**
 * Domain-level lead types. Re-exports the canonical {@link LeadState} enum
 * from `@shared/lead-state.constants` (DTOs may not depend on `@domain/*`,
 * so the literal union lives in `@shared/*`).
 */
export {
  LEAD_STATES,
  isLeadState,
  type LeadState,
} from '@shared/lead-state.constants';

/**
 * Shape of structured qualification fields captured during a sales/lead
 * qualifier run. All sub-fields are optional — the agent may learn them
 * one turn at a time and the lifecycle service merges last-write-wins.
 */
export interface LeadFields {
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
