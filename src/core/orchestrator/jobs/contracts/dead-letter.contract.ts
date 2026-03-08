/**
 * Dead-letter queue contract. DLQ jobs store original job metadata for debugging.
 */

export const BILLING_DLQ_NAME = 'billing-dlq';

export interface DeadLetterPayload {
  originalJobId: string;
  jobName: string;
  payload: unknown;
  error: string;
  timestamp: string; // ISO 8601
}
