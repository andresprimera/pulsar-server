import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  TELEGRAM_WEBHOOK_QUEUE_NAME,
  TELEGRAM_WEBHOOK_REGISTER_JOB,
  TelegramWebhookRegisterPayload,
} from '@orchestrator/jobs/contracts/webhook-registration.contract';

@Injectable()
export class WebhookRegistrationCoordinator {
  private readonly logger = new Logger(WebhookRegistrationCoordinator.name);

  constructor(
    @InjectQueue(TELEGRAM_WEBHOOK_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async enqueueForTelegramChannels(input: {
    clientAgentId: string;
    telegramBotIds: string[];
  }): Promise<void> {
    for (const botId of input.telegramBotIds) {
      try {
        await this.queue.add(
          TELEGRAM_WEBHOOK_REGISTER_JOB,
          { telegramBotId: botId } satisfies TelegramWebhookRegisterPayload,
          {
            jobId: `tg-webhook:${botId}`,
            attempts: 6,
            backoff: { type: 'telegram-webhook-backoff' },
            removeOnComplete: { count: 1000 },
          },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue telegram webhook registration job for botId=${botId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
