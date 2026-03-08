import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Job } from 'bullmq';
import {
  BILLING_DLQ_NAME,
  DeadLetterPayload,
} from '@orchestrator/jobs/contracts/dead-letter.contract';

/**
 * Moves failed jobs (exhausted retries) to the dead-letter queue with full metadata.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(@InjectQueue(BILLING_DLQ_NAME) private readonly dlq: Queue) {}

  async moveToDeadLetter(job: Job, error: Error): Promise<void> {
    const payload: DeadLetterPayload = {
      originalJobId: String(job.id),
      jobName: job.name,
      payload: job.data,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
    await this.dlq.add('dlq', payload, {
      jobId: `dlq:${job.name}:${job.id}:${Date.now()}`,
      removeOnComplete: { count: 5000 },
    });
    this.logger.log(
      `Job moved to DLQ: originalJobId=${job.id} jobName=${job.name} error=${error.message}`,
    );
  }
}
