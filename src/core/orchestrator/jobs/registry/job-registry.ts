import type { JobsOptions } from 'bullmq';
import {
  BILLING_QUEUE_NAME,
  BILLING_JOB_GENERATE_ALL,
} from '@orchestrator/jobs/contracts/billing-job.contract';
import {
  TELEGRAM_WEBHOOK_QUEUE_NAME,
  TELEGRAM_WEBHOOK_REGISTER_JOB,
} from '@orchestrator/jobs/contracts/webhook-registration.contract';

export interface QueueLimiter {
  max: number;
  duration: number;
}

export interface JobDefinition {
  queueName: string;
  jobName: string;
  defaultOptions: JobsOptions;
  /** Prefix for stable jobId; full id = `${jobIdPrefix}:${periodKey}` or similar */
  jobIdPrefix: string;
  /** Optional rate limit: max jobs per duration (ms). */
  limiter?: QueueLimiter;
}

export const JOB_DEFINITIONS = {
  billingGenerateAll: {
    queueName: BILLING_QUEUE_NAME,
    jobName: BILLING_JOB_GENERATE_ALL,
    defaultOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: { count: 1000 },
    },
    jobIdPrefix: 'billing:generateAll',
    limiter: { max: 50, duration: 1000 } as QueueLimiter,
  },
  telegramWebhookRegister: {
    queueName: TELEGRAM_WEBHOOK_QUEUE_NAME,
    jobName: TELEGRAM_WEBHOOK_REGISTER_JOB,
    defaultOptions: {
      attempts: 6,
      backoff: { type: 'telegram-webhook-backoff' },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
    jobIdPrefix: 'tg-webhook',
  } satisfies JobDefinition,
} as const satisfies Record<string, JobDefinition>;

/** Processor/worker options for billing (concurrency + optional limiter). */
export const BILLING_PROCESSOR_OPTIONS = {
  concurrency: 1,
  limiter: JOB_DEFINITIONS.billingGenerateAll.limiter,
} as const;

const TELEGRAM_WEBHOOK_BACKOFF_CURVE_MS = [
  30_000, 120_000, 600_000, 3_600_000, 21_600_000, 86_400_000,
];

export const TELEGRAM_WEBHOOK_PROCESSOR_OPTIONS = {
  concurrency: 5,
  settings: {
    backoffStrategy: (attemptsMade: number, type?: string) => {
      if (type !== 'telegram-webhook-backoff') {
        return 0;
      }
      const idx = Math.min(
        Math.max(attemptsMade - 1, 0),
        TELEGRAM_WEBHOOK_BACKOFF_CURVE_MS.length - 1,
      );
      return TELEGRAM_WEBHOOK_BACKOFF_CURVE_MS[idx];
    },
  },
} as const;

export type JobKey = keyof typeof JOB_DEFINITIONS;
