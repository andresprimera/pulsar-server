import { LeadLifecycleService } from './lead-lifecycle.service';
import type { LeadFields } from './lead.types';

describe('LeadLifecycleService', () => {
  let service: LeadLifecycleService;

  beforeEach(() => {
    service = new LeadLifecycleService();
  });

  describe('mergeFields', () => {
    it('keeps current when update is empty', () => {
      const current: LeadFields = { intent: 'demo' };
      const next = service.mergeFields(current, {});
      expect(next).toEqual({ intent: 'demo' });
    });

    it('overrides per field on update', () => {
      const current: LeadFields = {
        intent: 'demo',
        budget: { amount: 1000, currency: 'USD' },
      };
      const next = service.mergeFields(current, {
        budget: { amount: 5000 },
      });
      expect(next.budget).toEqual({ amount: 5000, currency: 'USD' });
      expect(next.intent).toBe('demo');
    });

    it('ignores empty strings in scalar fields', () => {
      const current: LeadFields = { intent: 'demo' };
      const next = service.mergeFields(current, { intent: '' });
      expect(next.intent).toBe('demo');
    });

    it('ignores empty strings in nested fields', () => {
      const current: LeadFields = {
        budget: { currency: 'USD' },
        timeline: { horizon: 'Q3' },
        contactPreferences: { preferredChannel: 'email' },
      };
      const next = service.mergeFields(current, {
        budget: { currency: '' },
        timeline: { horizon: '' },
        contactPreferences: { preferredChannel: '' },
      });
      expect(next.budget?.currency).toBe('USD');
      expect(next.timeline?.horizon).toBe('Q3');
      expect(next.contactPreferences?.preferredChannel).toBe('email');
    });

    it('appends notes preserving existing entries; drops empty-string notes', () => {
      const current: LeadFields = { notes: ['first'] };
      const next = service.mergeFields(current, {
        notes: ['second', '', 'third'],
      });
      expect(next.notes).toEqual(['first', 'second', 'third']);
    });

    it('returns a new object reference (immutable)', () => {
      const current: LeadFields = {
        intent: 'demo',
        budget: { amount: 100 },
      };
      const next = service.mergeFields(current, { intent: 'pricing' });
      expect(next).not.toBe(current);
      expect(next.budget).not.toBe(current.budget);
      expect(current.intent).toBe('demo'); // unchanged
    });
  });

  describe('computeNextState', () => {
    it('keeps current state when fields are empty', () => {
      expect(service.computeNextState({}, false, 'new')).toBe('new');
    });

    it('returns in_progress when only budget is present', () => {
      expect(
        service.computeNextState({ budget: { amount: 100 } }, false, 'new'),
      ).toBe('in_progress');
    });

    it('returns in_progress when budget+intent (no timeline)', () => {
      expect(
        service.computeNextState(
          { budget: { amount: 100 }, intent: 'demo' },
          false,
          'new',
        ),
      ).toBe('in_progress');
    });

    it('returns qualified when all three are captured', () => {
      expect(
        service.computeNextState(
          {
            budget: { amount: 100 },
            intent: 'demo',
            timeline: { horizon: 'Q3' },
          },
          false,
          'new',
        ),
      ).toBe('qualified');
    });

    it('returns disqualified when disqualified=true even with all three captured', () => {
      expect(
        service.computeNextState(
          {
            budget: { amount: 100 },
            intent: 'demo',
            timeline: { horizon: 'Q3' },
          },
          true,
          'in_progress',
        ),
      ).toBe('disqualified');
    });

    it('returns disqualified when disqualified=true with no fields', () => {
      expect(service.computeNextState({}, true, 'new')).toBe('disqualified');
    });

    it('treats budget amount=0 as a captured value (numeric, not empty)', () => {
      expect(
        service.computeNextState({ budget: { amount: 0 } }, false, 'new'),
      ).toBe('in_progress');
    });
  });
});
