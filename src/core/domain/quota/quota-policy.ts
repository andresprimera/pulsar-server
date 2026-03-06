import { BillingPeriod } from '@domain/billing/billing-period';

/**
 * Clamps a day to the last day of the given month (e.g. 31 in February → 28 or 29).
 */
function clampDayToMonth(day: number, year: number, month: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/**
 * Pure domain policy for quota exhaustion. No dependencies.
 */
export const QuotaPolicy = {
  /**
   * null quota = unlimited = never exceeded.
   */
  isExceeded(quota: number | null, currentUsage: number): boolean {
    if (quota === null) return false;
    return currentUsage >= quota;
  },

  /**
   * Monthly period anchored to the hire date's day-of-month.
   * Uses clamped day when anchor day does not exist in the month (e.g. Jan 31 → Feb 28/29).
   * now defaults to new Date(). Returns a BillingPeriod value object [start, end).
   */
  computeCurrentBillingPeriod(
    billingAnchor: Date,
    now: Date = new Date(),
  ): BillingPeriod {
    const anchor = new Date(billingAnchor);
    const year = now.getFullYear();
    const month = now.getMonth();
    const anchorDay = anchor.getDate();

    const startDay = clampDayToMonth(anchorDay, year, month);
    const endDay = clampDayToMonth(anchorDay, year, month + 1);
    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    const end = new Date(year, month + 1, endDay, 0, 0, 0, 0);

    if (now < start) {
      start.setMonth(start.getMonth() - 1);
      start.setDate(
        clampDayToMonth(anchorDay, start.getFullYear(), start.getMonth()),
      );
      end.setMonth(end.getMonth() - 1);
      end.setDate(
        clampDayToMonth(anchorDay, end.getFullYear(), end.getMonth()),
      );
    }

    return new BillingPeriod(start, end);
  },
};
