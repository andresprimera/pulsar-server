import { BillingPeriod } from '@domain/billing/billing-period';

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
   * now defaults to new Date(). Returns a BillingPeriod value object.
   */
  computeCurrentBillingPeriod(
    billingAnchor: Date,
    now: Date = new Date(),
  ): BillingPeriod {
    const anchor = new Date(billingAnchor);
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = anchor.getDate();

    const start = new Date(year, month, day, 0, 0, 0, 0);
    const end = new Date(year, month + 1, day, 0, 0, 0, 0);

    if (now < start) {
      start.setMonth(start.getMonth() - 1);
      end.setMonth(end.getMonth() - 1);
    }

    return new BillingPeriod(start, end);
  },
};
