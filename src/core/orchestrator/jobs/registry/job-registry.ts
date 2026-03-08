import type { JobsOptions } from 'bullmq';
import {
  BILLING_QUEUE_NAME,
  BILLING_JOB_GENERATE_ALL,
} from '@orchestrator/jobs/contracts/billing-job.contract';

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
} as const satisfies Record<string, JobDefinition>;

/** Processor/worker options for billing (concurrency + optional limiter). */
export const BILLING_PROCESSOR_OPTIONS = {
  concurrency: 1,
  limiter: JOB_DEFINITIONS.billingGenerateAll.limiter,
} as const;

export type JobKey = keyof typeof JOB_DEFINITIONS;
