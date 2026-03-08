import { UnrecoverableError as BullMQUnrecoverableError } from 'bullmq';

/**
 * Recoverable job error. When thrown, BullMQ will retry according to job options.
 * Use for transient failures (network, temporary DB errors, rate limits).
 */
export class RecoverableJobError extends Error {
  readonly name = 'RecoverableJobError';

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    Object.setPrototypeOf(this, RecoverableJobError.prototype);
  }
}

/**
 * Permanent job error. When thrown, BullMQ skips retries and fails the job
 * immediately (maps to BullMQ UnrecoverableError). Use for validation errors,
 * business rule violations, or known unrecoverable conditions.
 */
export class PermanentJobError extends BullMQUnrecoverableError {
  readonly name = 'PermanentJobError';

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    Object.setPrototypeOf(this, PermanentJobError.prototype);
  }
}

/**
 * Type guard: true if the error should not be retried.
 */
export function isPermanentJobError(err: unknown): err is PermanentJobError {
  return err instanceof PermanentJobError;
}
