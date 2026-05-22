import { Injectable } from '@nestjs/common';
import type { LeadState } from '@shared/lead-state.constants';
import type { LeadFields } from './lead.types';

/**
 * Pure, framework-agnostic lead lifecycle policy.
 *
 * - {@link mergeFields} applies a last-write-wins merge of structured
 *   qualification fields, ignoring empty strings.
 * - {@link computeNextState} determines the deterministic next state from
 *   the merged fields and an optional disqualification flag.
 *
 * Domain-layer purity: this file only imports `@nestjs/common`
 * (`@Injectable()`) and `@shared/lead-state.constants` (types). No
 * persistence, no agent, no channels.
 */
@Injectable()
export class LeadLifecycleService {
  /**
   * Last-write-wins merge of structured lead fields.
   *
   * - Empty strings are ignored (treated as "no update for this key").
   * - Nested objects (`budget`, `timeline`, `contactPreferences`) are
   *   merged field-by-field, also ignoring empty strings on their keys.
   * - `notes` are appended (preserving existing notes); empty strings are
   *   dropped.
   * - Returns a new object reference (immutable; never mutates `current`).
   */
  mergeFields(current: LeadFields, update: Partial<LeadFields>): LeadFields {
    const next: LeadFields = {
      ...(current.budget !== undefined
        ? { budget: { ...current.budget } }
        : {}),
      ...(current.intent !== undefined ? { intent: current.intent } : {}),
      ...(current.timeline !== undefined
        ? { timeline: { ...current.timeline } }
        : {}),
      ...(current.notes !== undefined ? { notes: [...current.notes] } : {}),
      ...(current.contactPreferences !== undefined
        ? { contactPreferences: { ...current.contactPreferences } }
        : {}),
    };

    if (update.budget !== undefined) {
      const merged = { ...(next.budget ?? {}) };
      if (update.budget.amount !== undefined) {
        merged.amount = update.budget.amount;
      }
      if (update.budget.currency !== undefined) {
        if (update.budget.currency !== '') {
          merged.currency = update.budget.currency;
        }
      }
      next.budget = merged;
    }

    if (update.intent !== undefined) {
      if (update.intent !== '') {
        next.intent = update.intent;
      }
    }

    if (update.timeline !== undefined) {
      const merged = { ...(next.timeline ?? {}) };
      if (update.timeline.horizon !== undefined) {
        if (update.timeline.horizon !== '') {
          merged.horizon = update.timeline.horizon;
        }
      }
      next.timeline = merged;
    }

    if (update.notes !== undefined) {
      const filtered = update.notes.filter((n) => n !== '');
      if (filtered.length > 0) {
        next.notes = [...(next.notes ?? []), ...filtered];
      }
    }

    if (update.contactPreferences !== undefined) {
      const merged = { ...(next.contactPreferences ?? {}) };
      if (update.contactPreferences.preferredChannel !== undefined) {
        if (update.contactPreferences.preferredChannel !== '') {
          merged.preferredChannel = update.contactPreferences.preferredChannel;
        }
      }
      if (update.contactPreferences.preferredTime !== undefined) {
        if (update.contactPreferences.preferredTime !== '') {
          merged.preferredTime = update.contactPreferences.preferredTime;
        }
      }
      next.contactPreferences = merged;
    }

    return next;
  }

  /**
   * Determines the next lifecycle state given merged fields and an explicit
   * disqualification flag.
   *
   * Order of precedence:
   *  1. `disqualified === true` → `'disqualified'`.
   *  2. budget.amount + intent + timeline.horizon all present → `'qualified'`.
   *  3. any one of the three present → `'in_progress'`.
   *  4. otherwise → preserve `currentState`.
   */
  computeNextState(
    fields: LeadFields,
    disqualified: boolean,
    currentState: LeadState,
  ): LeadState {
    if (disqualified === true) {
      return 'disqualified';
    }

    const hasBudget =
      fields.budget?.amount !== undefined && fields.budget?.amount !== null;
    const hasIntent =
      typeof fields.intent === 'string' && fields.intent.trim() !== '';
    const hasTimeline =
      typeof fields.timeline?.horizon === 'string' &&
      fields.timeline.horizon.trim() !== '';

    if (hasBudget && hasIntent && hasTimeline) {
      return 'qualified';
    }

    if (hasBudget || hasIntent || hasTimeline) {
      return 'in_progress';
    }

    return currentState;
  }
}
