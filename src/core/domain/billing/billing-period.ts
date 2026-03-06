/**
 * Value object representing a billing period. Ensures a single canonical
 * representation for start/end windows across quota and billing logic.
 */
export class BillingPeriod {
  constructor(public readonly start: Date, public readonly end: Date) {}

  contains(date: Date): boolean {
    return date >= this.start && date < this.end;
  }
}
