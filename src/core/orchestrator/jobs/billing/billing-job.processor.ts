import { OnApplicationShutdown, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BillingGeneratorService } from '@orchestrator/billing-generator.service';
import {
  BILLING_QUEUE_NAME,
  BILLING_JOB_GENERATE_ALL,
  BillingGenerateAllPayload,
  BillingGenerateAllResult,
} from '@orchestrator/jobs/contracts/billing-job.contract';
import { JobMetricsService } from '@orchestrator/observability/job-metrics.service';
import { QueueHealthService } from '@orchestrator/observability/queue-health.service';
import { DeadLetterService } from '@orchestrator/observability/dead-letter.service';
import {
  PermanentJobError,
  isPermanentJobError,
} from '@orchestrator/errors/job-errors';
import { BILLING_PROCESSOR_OPTIONS } from '@orchestrator/jobs/registry/job-registry';

@Processor(BILLING_QUEUE_NAME, BILLING_PROCESSOR_OPTIONS)
export class BillingJobProcessor
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(BillingJobProcessor.name);

  constructor(
    private readonly billingGeneratorService: BillingGeneratorService,
    private readonly metrics: JobMetricsService,
    private readonly queueHealth: QueueHealthService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    this.logger.log('Billing worker closed (graceful shutdown)');
  }

  @OnWorkerEvent('active')
  onActive(
    job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>,
  ): void {
    const processedOn =
      typeof job.processedOn === 'number' ? job.processedOn : undefined;
    const timestamp =
      typeof job.timestamp === 'number' ? job.timestamp : undefined;
    this.metrics.recordJobStarted({
      queueName: BILLING_QUEUE_NAME,
      jobName: job.name,
      jobId: String(job.id),
      timestamp: timestamp ?? Date.now(),
      processedOn,
    });
    this.logger.log(
      `Billing job started: id=${job.id} name=${job.name} traceId=${
        (job.data as BillingGenerateAllPayload).traceId ?? 'n/a'
      }`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(
    job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>,
  ): void {
    const durationMs =
      job.finishedOn != null && job.processedOn != null
        ? job.finishedOn - job.processedOn
        : 0;
    this.metrics.recordJobCompleted({
      queueName: BILLING_QUEUE_NAME,
      jobName: job.name,
      jobId: String(job.id),
      durationMs,
      attempt: job.attemptsMade,
    });
    this.queueHealth.recordJobCompleted();
  }

  @OnWorkerEvent('failed')
  onFailed(
    job:
      | Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>
      | undefined,
    error: Error,
  ): void {
    if (job) {
      this.metrics.recordJobFailed({
        queueName: BILLING_QUEUE_NAME,
        jobName: job.name,
        jobId: String(job.id),
        attempt: job.attemptsMade,
      });
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade >= attempts) {
        this.deadLetter.moveToDeadLetter(job, error).catch((dlqErr) => {
          this.logger.error(
            `Failed to move job to DLQ: jobId=${job.id} error=${
              dlqErr instanceof Error ? dlqErr.message : String(dlqErr)
            }`,
          );
        });
      }
    }
    this.logger.error(
      `Billing job failed (exhausted retries or final failure): jobId=${job?.id} error=${error.message}`,
    );
  }

  async process(
    job: Job<BillingGenerateAllPayload, BillingGenerateAllResult, string>,
  ): Promise<BillingGenerateAllResult> {
    if (job.name !== BILLING_JOB_GENERATE_ALL) {
      this.logger.warn(`Unknown job name: ${job.name}, ignoring`);
      return { generated: 0, skipped: 0 };
    }
    const traceId = job.data.traceId ?? 'n/a';
    const start = Date.now();
    try {
      const result = await this.billingGeneratorService.generateForAllClients();
      const duration = Date.now() - start;
      this.logger.log(
        `Billing job completed: id=${job.id} traceId=${traceId} generated=${result.generated} skipped=${result.skipped} durationMs=${duration}`,
      );
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Billing job failed: id=${job.id} traceId=${traceId} durationMs=${duration} error=${message}`,
      );
      if (isPermanent(err)) {
        throw new PermanentJobError(message, err);
      }
      throw err;
    }
  }
}

function isPermanent(err: unknown): boolean {
  if (isPermanentJobError(err)) return true;
  const e = err as { code?: number };
  if (typeof e?.code === 'number' && e.code === 11000) return true;
  return false;
}
