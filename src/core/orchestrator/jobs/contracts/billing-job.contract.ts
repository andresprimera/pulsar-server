/**
 * Typed contracts for billing queue jobs. Prevents payload/result schema drift
 * between scheduler and processor.
 */

export const BILLING_QUEUE_NAME = 'billing';
export const BILLING_JOB_GENERATE_ALL = 'generateAll';

export interface BillingGenerateAllPayload {
  /** Correlation ID for tracing (UUID). Set by scheduler. */
  traceId?: string;
  /** When the job was scheduled (ISO 8601). */
  scheduledAt: string;
}

export interface BillingGenerateAllResult {
  generated: number;
  skipped: number;
}
