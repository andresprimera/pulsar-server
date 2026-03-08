import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobMetricsService } from '@orchestrator/observability/job-metrics.service';
import { BILLING_QUEUE_NAME } from '@orchestrator/jobs/contracts/billing-job.contract';

const HEALTH_CHECK_INTERVAL_MS = 60_000;
const QUEUE_DEPTH_WARN = 100;
const OLDEST_JOB_AGE_WARN_MS = 5 * 60 * 1000; // 5 minutes
const LATENCY_WARN_MS = 30_000; // 30 seconds

/**
 * Lightweight queue health monitoring. Runs only in worker mode.
 * Logs warnings for backlog, old jobs, high latency, and worker starvation.
 */
@Injectable()
export class QueueHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueHealthService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastCompletedAt = 0;

  constructor(
    @InjectQueue(BILLING_QUEUE_NAME) private readonly queue: Queue,
    private readonly metrics: JobMetricsService,
  ) {}

  onModuleInit(): void {
    if (process.env.WORKER_MODE !== 'true') return;
    this.intervalId = setInterval(
      () => this.runHealthCheck(),
      HEALTH_CHECK_INTERVAL_MS,
    );
    this.logger.log('Queue health monitoring started (worker mode)');
  }

  onModuleDestroy(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  recordJobCompleted(): void {
    this.lastCompletedAt = Date.now();
  }

  private async runHealthCheck(): Promise<void> {
    try {
      const counts = await this.queue.getJobCounts();
      const waiting = counts.waiting ?? 0;
      const active = counts.active ?? 0;
      const delayed = counts.delayed ?? 0;
      const total = waiting + active + delayed;
      this.metrics.setQueueDepth(BILLING_QUEUE_NAME, total);

      if (total >= QUEUE_DEPTH_WARN) {
        this.logger.warn(
          `Queue backlog detected: queue=${BILLING_QUEUE_NAME} depth=${total} waiting=${waiting} active=${active} delayed=${delayed}`,
        );
      }

      const oldest = await this.getOldestWaitingJobAge();
      if (oldest != null && oldest > OLDEST_JOB_AGE_WARN_MS) {
        this.logger.warn(
          `Oldest job age exceeds threshold: queue=${BILLING_QUEUE_NAME} oldestAgeMs=${oldest} thresholdMs=${OLDEST_JOB_AGE_WARN_MS}`,
        );
      }

      const latencyMs = this.metrics.getRecentQueueLatencyMs();
      if (latencyMs != null && latencyMs > LATENCY_WARN_MS) {
        this.logger.warn(
          `Queue latency high: queue=${BILLING_QUEUE_NAME} queue_latency_ms=${latencyMs} thresholdMs=${LATENCY_WARN_MS}`,
        );
      }

      const idleMs = Date.now() - this.lastCompletedAt;
      if (
        this.lastCompletedAt > 0 &&
        total > 0 &&
        idleMs > HEALTH_CHECK_INTERVAL_MS * 2
      ) {
        this.logger.warn(
          `Worker starvation detected: queue=${BILLING_QUEUE_NAME} depth=${total} lastCompletedAgoMs=${idleMs}`,
        );
      }

      const signals = this.metrics.getAutoscalingSignals(BILLING_QUEUE_NAME);
      this.logger.debug(
        `Queue health: depth=${
          signals.queueDepth
        } rate=${signals.jobsProcessedPerSecond.toFixed(2)}/s avgDurationMs=${
          signals.avgJobDurationMs
        }`,
      );
    } catch (err) {
      this.logger.error(
        `Queue health check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async getOldestWaitingJobAge(): Promise<number | null> {
    const waiting = await this.queue.getWaiting(0, 0);
    if (waiting.length === 0) return null;
    const job = waiting[0];
    const timestamp = job.timestamp ?? job.processedOn;
    if (timestamp == null) return null;
    return Date.now() - timestamp;
  }
}
