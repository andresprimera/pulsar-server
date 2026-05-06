import { Inject, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  TELEGRAM_WEBHOOK_QUEUE_NAME,
  TELEGRAM_WEBHOOK_REGISTER_JOB,
  TelegramWebhookRegisterPayload,
  TelegramWebhookRegisterResult,
} from '@orchestrator/jobs/contracts/webhook-registration.contract';
import { TELEGRAM_WEBHOOK_PROCESSOR_OPTIONS } from '@orchestrator/jobs/registry/job-registry';
import { JobMetricsService } from '@orchestrator/observability/job-metrics.service';
import { DeadLetterService } from '@orchestrator/observability/dead-letter.service';
import {
  PermanentJobError,
  RecoverableJobError,
} from '@orchestrator/errors/job-errors';
import { decryptRecord } from '@shared/crypto.util';
import {
  computeTelegramWebhookFingerprint,
  deriveTelegramWebhookSecret,
} from '@shared/telegram-webhook-secret.util';
import {
  HIRE_CHANNEL_LIFECYCLE_PORT,
  HireChannelLifecyclePort,
} from '@shared/ports/hire-channel-lifecycle.port';
import { TelegramService } from '@channels/telegram/telegram.service';

@Processor(TELEGRAM_WEBHOOK_QUEUE_NAME, TELEGRAM_WEBHOOK_PROCESSOR_OPTIONS)
export class TelegramWebhookRegistrar
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramWebhookRegistrar.name);

  constructor(
    @Inject(HIRE_CHANNEL_LIFECYCLE_PORT)
    private readonly lifecycle: HireChannelLifecyclePort,
    private readonly telegramService: TelegramService,
    private readonly metrics: JobMetricsService,
    private readonly deadLetter: DeadLetterService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    this.logger.log('Telegram webhook registrar worker closed');
  }

  @OnWorkerEvent('active')
  onActive(
    job: Job<TelegramWebhookRegisterPayload, TelegramWebhookRegisterResult>,
  ): void {
    this.metrics.recordJobStarted({
      queueName: TELEGRAM_WEBHOOK_QUEUE_NAME,
      jobName: job.name,
      jobId: String(job.id),
      timestamp: typeof job.timestamp === 'number' ? job.timestamp : Date.now(),
      processedOn:
        typeof job.processedOn === 'number' ? job.processedOn : undefined,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(
    job: Job<TelegramWebhookRegisterPayload, TelegramWebhookRegisterResult>,
  ): void {
    const durationMs =
      job.finishedOn != null && job.processedOn != null
        ? job.finishedOn - job.processedOn
        : 0;
    this.metrics.recordJobCompleted({
      queueName: TELEGRAM_WEBHOOK_QUEUE_NAME,
      jobName: job.name,
      jobId: String(job.id),
      durationMs,
      attempt: job.attemptsMade,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(
    job:
      | Job<TelegramWebhookRegisterPayload, TelegramWebhookRegisterResult>
      | undefined,
    error: Error,
  ): void {
    if (job) {
      this.metrics.recordJobFailed({
        queueName: TELEGRAM_WEBHOOK_QUEUE_NAME,
        jobName: job.name,
        jobId: String(job.id),
        attempt: job.attemptsMade,
      });
      const attempts = job.opts.attempts ?? 1;
      const isFinal =
        error instanceof PermanentJobError || job.attemptsMade >= attempts;
      if (isFinal) {
        this.deadLetter.moveToDeadLetter(job, error).catch((dlqErr) => {
          this.logger.error(
            `Failed to move telegram webhook job to DLQ: jobId=${
              job.id
            } error=${
              dlqErr instanceof Error ? dlqErr.message : String(dlqErr)
            }`,
          );
        });
      }
    }
    this.logger.error(
      `Telegram webhook registration failed: jobId=${job?.id} error=${error.message}`,
    );
  }

  async process(
    job: Job<TelegramWebhookRegisterPayload, TelegramWebhookRegisterResult>,
  ): Promise<TelegramWebhookRegisterResult> {
    if (job.name !== TELEGRAM_WEBHOOK_REGISTER_JOB) {
      throw new PermanentJobError(`Unknown job name: ${job.name}`);
    }

    const { telegramBotId } = job.data;
    if (!telegramBotId) {
      throw new PermanentJobError('telegramBotId missing from payload');
    }

    const publicBaseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ?? '';
    if (!publicBaseUrl) {
      throw new PermanentJobError('PUBLIC_BASE_URL not configured');
    }

    const loaded = await this.lifecycle.loadForRegistration(telegramBotId);
    if (!loaded) {
      throw new PermanentJobError('hire-not-found');
    }

    const decrypted = decryptRecord(loaded.encryptedCredentials);
    const botToken = decrypted?.botToken;
    if (typeof botToken !== 'string' || !botToken.length) {
      throw new PermanentJobError('botToken missing');
    }

    const secretToken = deriveTelegramWebhookSecret(botToken);
    const url = `${publicBaseUrl}/telegram/webhook/${telegramBotId}`;
    const fingerprint = computeTelegramWebhookFingerprint(url, secretToken);

    if (
      loaded.webhookRegistration?.status === 'registered' &&
      loaded.webhookRegistration?.fingerprint === fingerprint
    ) {
      this.logger.log(
        `event=telegram_webhook_skip_in_memory_match telegramBotId=${telegramBotId}`,
      );
      return { registered: true, fingerprint };
    }

    const startMatch = await this.lifecycle.recordOutcome({
      telegramBotId,
      status: 'registering',
      fingerprint,
    });
    if (!startMatch.matched) {
      this.logger.log(
        `event=telegram_webhook_skip_fingerprint_match telegramBotId=${telegramBotId}`,
      );
      return { registered: true, fingerprint };
    }

    let result;
    try {
      result = await this.telegramService.lifecycle.registerWebhook({
        kind: 'plaintext',
        telegramBotId,
        botToken,
        publicBaseUrl,
      });
    } catch (err) {
      if (err instanceof RecoverableJobError) {
        await this.lifecycle.recordOutcome({
          telegramBotId,
          status: 'failed',
          lastError: err.message,
        });
        throw err;
      }
      throw err;
    }

    if (result.registered) {
      await this.lifecycle.recordOutcome({
        telegramBotId,
        status: 'registered',
        fingerprint,
      });
      return { registered: true, fingerprint };
    }

    const errorMessage = result.error ?? 'Telegram setWebhook rejected';
    await this.lifecycle.recordOutcome({
      telegramBotId,
      status: 'failed',
      lastError: errorMessage,
    });
    throw new PermanentJobError(errorMessage);
  }
}
