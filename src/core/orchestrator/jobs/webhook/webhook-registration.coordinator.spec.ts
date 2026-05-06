import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  TELEGRAM_WEBHOOK_QUEUE_NAME,
  TELEGRAM_WEBHOOK_REGISTER_JOB,
} from '@orchestrator/jobs/contracts/webhook-registration.contract';
import { WebhookRegistrationCoordinator } from './webhook-registration.coordinator';

describe('WebhookRegistrationCoordinator', () => {
  let coordinator: WebhookRegistrationCoordinator;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookRegistrationCoordinator,
        {
          provide: getQueueToken(TELEGRAM_WEBHOOK_QUEUE_NAME),
          useValue: queue,
        },
      ],
    }).compile();

    coordinator = module.get(WebhookRegistrationCoordinator);
  });

  it('enqueues one job per botId with stable jobId and backoff strategy', async () => {
    await coordinator.enqueueForTelegramChannels({
      clientAgentId: 'ca-1',
      telegramBotIds: ['111', '222'],
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      TELEGRAM_WEBHOOK_REGISTER_JOB,
      { telegramBotId: '111' },
      expect.objectContaining({
        jobId: 'tg-webhook:111',
        attempts: 6,
        backoff: { type: 'telegram-webhook-backoff' },
        removeOnComplete: { count: 1000 },
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      TELEGRAM_WEBHOOK_REGISTER_JOB,
      { telegramBotId: '222' },
      expect.objectContaining({ jobId: 'tg-webhook:222' }),
    );
  });

  it('does not throw when queue.add fails (fail-soft)', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      coordinator.enqueueForTelegramChannels({
        clientAgentId: 'ca-1',
        telegramBotIds: ['111', '222'],
      }),
    ).resolves.toBeUndefined();

    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('handles empty telegramBotIds list', async () => {
    await coordinator.enqueueForTelegramChannels({
      clientAgentId: 'ca-1',
      telegramBotIds: [],
    });

    expect(queue.add).not.toHaveBeenCalled();
  });
});
