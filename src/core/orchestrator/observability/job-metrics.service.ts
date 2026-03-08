import { Injectable } from '@nestjs/common';

export interface JobMetricLabels {
  jobName: string;
  queueName: string;
}

export interface JobStartedEvent extends JobMetricLabels {
  jobId: string;
  timestamp: number;
  processedOn?: number;
}

export interface JobCompletedEvent extends JobMetricLabels {
  jobId: string;
  durationMs: number;
  attempt: number;
}

export interface JobFailedEvent extends JobMetricLabels {
  jobId: string;
  attempt: number;
}

export interface AutoscalingSignals {
  queueDepth: number;
  jobsProcessedPerSecond: number;
  avgJobDurationMs: number;
}

/** In-memory counters for queue/job metrics. Used by worker event handlers only. */
@Injectable()
export class JobMetricsService {
  private readonly jobStartedTotal = new Map<string, number>();
  private readonly jobCompletedTotal = new Map<string, number>();
  private readonly jobFailedTotal = new Map<string, number>();
  private readonly jobDurationsMs: number[] = [];
  private readonly queueLatenciesMs: number[] = [];
  private readonly completedTimestamps: number[] = [];
  private readonly activeStarts = new Map<
    string,
    { startedAt: number; queueName: string; jobName: string }
  >();
  private static readonly MAX_SAMPLES = 1000;
  private static readonly RATE_WINDOW_MS = 60_000;

  private key(labels: JobMetricLabels): string {
    return `${labels.queueName}:${labels.jobName}`;
  }

  private jobKey(jobId: string, queueName: string): string {
    return `${queueName}:${jobId}`;
  }

  recordJobStarted(event: JobStartedEvent): void {
    const k = this.key(event);
    this.jobStartedTotal.set(k, (this.jobStartedTotal.get(k) ?? 0) + 1);
    this.activeStarts.set(this.jobKey(event.jobId, event.queueName), {
      startedAt: Date.now(),
      queueName: event.queueName,
      jobName: event.jobName,
    });
    if (event.processedOn != null && event.timestamp != null) {
      const latencyMs = event.processedOn - event.timestamp;
      this.queueLatenciesMs.push(latencyMs);
      this.trim(this.queueLatenciesMs);
    }
  }

  recordJobCompleted(event: JobCompletedEvent): void {
    const k = this.key(event);
    this.jobCompletedTotal.set(k, (this.jobCompletedTotal.get(k) ?? 0) + 1);
    let durationMs = event.durationMs;
    const startEntry = this.activeStarts.get(
      this.jobKey(event.jobId, event.queueName),
    );
    if (startEntry) {
      this.activeStarts.delete(this.jobKey(event.jobId, event.queueName));
      if (durationMs <= 0) durationMs = Date.now() - startEntry.startedAt;
    }
    this.jobDurationsMs.push(durationMs);
    this.trim(this.jobDurationsMs);
    this.completedTimestamps.push(Date.now());
    this.trimTimestamps();
  }

  recordJobFailed(event: JobFailedEvent): void {
    const k = this.key(event);
    this.jobFailedTotal.set(k, (this.jobFailedTotal.get(k) ?? 0) + 1);
  }

  setQueueDepth(queueName: string, depth: number): void {
    (this as unknown as { _queueDepth: Map<string, number> })._queueDepth ??=
      new Map();
    (this as unknown as { _queueDepth: Map<string, number> })._queueDepth.set(
      queueName,
      depth,
    );
  }

  private trim(arr: number[]): void {
    while (arr.length > JobMetricsService.MAX_SAMPLES) arr.shift();
  }

  private trimTimestamps(): void {
    const cutoff = Date.now() - JobMetricsService.RATE_WINDOW_MS;
    while (this.completedTimestamps.length > 0) {
      const first = this.completedTimestamps[0];
      if (first === undefined || first >= cutoff) break;
      this.completedTimestamps.shift();
    }
  }

  getJobStartedTotal(labels: JobMetricLabels): number {
    return this.jobStartedTotal.get(this.key(labels)) ?? 0;
  }

  getJobCompletedTotal(labels: JobMetricLabels): number {
    return this.jobCompletedTotal.get(this.key(labels)) ?? 0;
  }

  getJobFailedTotal(labels: JobMetricLabels): number {
    return this.jobFailedTotal.get(this.key(labels)) ?? 0;
  }

  getRecentQueueLatencyMs(): number | null {
    if (this.queueLatenciesMs.length === 0) return null;
    const sum = this.queueLatenciesMs.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.queueLatenciesMs.length);
  }

  getRecentJobDurationMs(): number | null {
    if (this.jobDurationsMs.length === 0) return null;
    const sum = this.jobDurationsMs.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.jobDurationsMs.length);
  }

  getQueueDepth(queueName: string): number {
    const m = (this as unknown as { _queueDepth?: Map<string, number> })
      ._queueDepth;
    return m?.get(queueName) ?? 0;
  }

  getJobsProcessedPerSecond(): number {
    this.trimTimestamps();
    if (this.completedTimestamps.length < 2) return 0;
    const windowMs = Date.now() - (this.completedTimestamps[0] ?? 0);
    if (windowMs <= 0) return 0;
    return this.completedTimestamps.length / (windowMs / 1000);
  }

  getAutoscalingSignals(queueName: string): AutoscalingSignals {
    return {
      queueDepth: this.getQueueDepth(queueName),
      jobsProcessedPerSecond: this.getJobsProcessedPerSecond(),
      avgJobDurationMs: this.getRecentJobDurationMs() ?? 0,
    };
  }

  /** Snapshot for logging or metrics export (e.g. job_started_total, job_completed_total, etc.). */
  getSnapshot(
    queueName: string,
    jobName: string,
  ): {
    job_started_total: number;
    job_completed_total: number;
    job_failed_total: number;
    job_duration_ms: number | null;
    queue_latency_ms: number | null;
    queue_depth: number;
  } {
    const labels = { queueName, jobName };
    return {
      job_started_total: this.getJobStartedTotal(labels),
      job_completed_total: this.getJobCompletedTotal(labels),
      job_failed_total: this.getJobFailedTotal(labels),
      job_duration_ms: this.getRecentJobDurationMs(),
      queue_latency_ms: this.getRecentQueueLatencyMs(),
      queue_depth: this.getQueueDepth(queueName),
    };
  }
}
