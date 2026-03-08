import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { DistributedLockService } from '@orchestrator/distributed-lock.service';
import {
  BILLING_QUEUE_NAME,
  BillingGenerateAllPayload,
} from '@orchestrator/jobs/contracts/billing-job.contract';
import { JOB_DEFINITIONS } from '@orchestrator/jobs/registry/job-registry';

const BILLING_CRON_LOCK_KEY = 'pulsar:billing:cron:lock';
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class BillingJobScheduler {
  private readonly logger = new Logger(BillingJobScheduler.name);

  constructor(
    @InjectQueue(BILLING_QUEUE_NAME) private readonly queue: Queue,
    private readonly lockService: DistributedLockService,
  ) {}

  /**
   * Runs on the 1st of every month at 00:00 UTC. Only the instance that acquires
   * the distributed lock enqueues the job. Runs only in API process (not in worker).
   */
  @Cron('0 0 1 * *', { timeZone: 'UTC' })
  async scheduleBillingJob(): Promise<void> {
    this.logger.debug('Billing cron tick: attempting to acquire lock');
    const token = await this.lockService.acquire(
      BILLING_CRON_LOCK_KEY,
      LOCK_TTL_MS,
    );
    if (!token) {
      this.logger.debug('Billing cron: lock not acquired, skipping enqueue');
      return;
    }
    try {
      const periodKey = this.getCurrentPeriodKey();
      const def = JOB_DEFINITIONS.billingGenerateAll;
      const jobId = `${def.jobIdPrefix}:${periodKey}`;
      const scheduledAt = new Date().toISOString();
      const payload: BillingGenerateAllPayload = {
        traceId: randomUUID(),
        scheduledAt,
      };
      await this.queue.add(def.jobName, payload, {
        jobId,
        ...def.defaultOptions,
      });
      this.logger.log(`Billing cron: enqueued job ${jobId}`);
    } finally {
      await this.lockService.release(BILLING_CRON_LOCK_KEY, token);
    }
  }

  private getCurrentPeriodKey(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
