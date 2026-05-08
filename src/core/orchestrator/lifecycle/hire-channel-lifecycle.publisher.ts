import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  TELEGRAM_WEBHOOK_QUEUE_NAME,
  TELEGRAM_WEBHOOK_REGISTER_JOB,
  TelegramWebhookRegisterPayload,
} from '@orchestrator/jobs/contracts/webhook-registration.contract';
import {
  JOB_DEFINITIONS,
  TELEGRAM_WEBHOOK_RECONCILER_PROBE_OPTS,
} from '@orchestrator/jobs/registry/job-registry';
import {
  HIRE_CHANNEL_LIFECYCLE_PORT,
  HireChannelLifecyclePort,
} from '@shared/ports/hire-channel-lifecycle.port';

/**
 * Single publisher for hire-lifecycle webhook-registration events. Used by
 * application services (post-commit, pre-enqueue happy path) and by the
 * reconciler (probe path with shorter retry policy).
 *
 * Port-only access to persistence — orchestrator MUST NOT import
 * `ClientAgentRepository` directly per `.cursorrules` §3.
 */
@Injectable()
export class HireChannelLifecyclePublisher {
  private readonly logger = new Logger(HireChannelLifecyclePublisher.name);

  constructor(
    @InjectQueue(TELEGRAM_WEBHOOK_QUEUE_NAME)
    private readonly queue: Queue,
    @Inject(HIRE_CHANNEL_LIFECYCLE_PORT)
    private readonly lifecycle: HireChannelLifecyclePort,
  ) {}

  /**
   * Happy-path enqueue — used post-commit, pre-enqueue from feature services
   * after stamping `pending` on every active telegram channel. Uses the
   * existing 6-attempt curve from `JOB_DEFINITIONS.telegramWebhookRegister`.
   */
  async publishHappyPath(input: {
    clientAgentId: string;
    telegramBotIds: string[];
  }): Promise<void> {
    for (const botId of input.telegramBotIds) {
      try {
        await this.queue.add(
          TELEGRAM_WEBHOOK_REGISTER_JOB,
          { telegramBotId: botId } satisfies TelegramWebhookRegisterPayload,
          {
            jobId: `${JOB_DEFINITIONS.telegramWebhookRegister.jobIdPrefix}-${botId}`,
            ...JOB_DEFINITIONS.telegramWebhookRegister.defaultOptions,
          },
        );
      } catch (err) {
        this.logger.warn(
          `event=hire_lifecycle_publisher_happy_path_enqueue_failed botId=${botId} clientAgentId=${
            input.clientAgentId
          } error=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Reconciler-driven probe enqueue — short-retry policy (~1m max wall-clock
   * per probe). The reconciler counts terminal probe outcomes via persisted
   * `attemptCount`; quarantine is decided by the reconciler before enqueueing
   * (so this method does not enforce it).
   */
  async publishProbe(input: { telegramBotId: string }): Promise<void> {
    const { telegramBotId } = input;
    try {
      await this.queue.add(
        TELEGRAM_WEBHOOK_REGISTER_JOB,
        { telegramBotId } satisfies TelegramWebhookRegisterPayload,
        {
          jobId: `${JOB_DEFINITIONS.telegramWebhookRegister.jobIdPrefix}-${telegramBotId}`,
          ...TELEGRAM_WEBHOOK_RECONCILER_PROBE_OPTS,
        },
      );
    } catch (err) {
      this.logger.warn(
        `event=hire_lifecycle_publisher_probe_enqueue_failed botId=${telegramBotId} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Convenience accessor exposing the shared port to the reconciler/back-callers
   * so the publisher remains the single orchestrator-side entry point for
   * webhook-registration coordination concerns.
   */
  get lifecyclePort(): HireChannelLifecyclePort {
    return this.lifecycle;
  }
}
