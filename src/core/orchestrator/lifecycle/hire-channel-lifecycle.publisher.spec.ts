import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { HireChannelLifecyclePublisher } from './hire-channel-lifecycle.publisher';
import { TELEGRAM_WEBHOOK_QUEUE_NAME } from '@orchestrator/jobs/contracts/webhook-registration.contract';
import {
  HIRE_CHANNEL_LIFECYCLE_PORT,
  HireChannelLifecyclePort,
} from '@shared/ports/hire-channel-lifecycle.port';

describe('HireChannelLifecyclePublisher', () => {
  let publisher: HireChannelLifecyclePublisher;
  let mockQueue: { add: jest.Mock };
  let mockLifecycle: HireChannelLifecyclePort;

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockLifecycle = {
      recordOutcome: jest.fn(),
      loadForRegistration: jest.fn(),
      quarantineTelegramRegistration: jest.fn(),
      findReconcilableTelegramHires: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HireChannelLifecyclePublisher,
        {
          provide: getQueueToken(TELEGRAM_WEBHOOK_QUEUE_NAME),
          useValue: mockQueue,
        },
        { provide: HIRE_CHANNEL_LIFECYCLE_PORT, useValue: mockLifecycle },
      ],
    }).compile();

    publisher = module.get(HireChannelLifecyclePublisher);
  });

  describe('publishHappyPath', () => {
    it('enqueues one job per botId with the 6-attempt curve and stable jobId', async () => {
      await publisher.publishHappyPath({
        clientAgentId: 'ca-1',
        telegramBotIds: ['bot-1', 'bot-2'],
      });

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      const [, payload1, opts1] = mockQueue.add.mock.calls[0];
      expect(payload1).toEqual({ telegramBotId: 'bot-1' });
      expect(opts1.jobId).toBe('tg-webhook:bot-1');
      expect(opts1.attempts).toBe(6);
      expect(opts1.backoff).toEqual({ type: 'telegram-webhook-backoff' });

      const [, , opts2] = mockQueue.add.mock.calls[1];
      expect(opts2.jobId).toBe('tg-webhook:bot-2');
    });

    it('swallows enqueue errors and logs a warning', async () => {
      mockQueue.add.mockRejectedValueOnce(new Error('redis-down'));
      await expect(
        publisher.publishHappyPath({
          clientAgentId: 'ca-1',
          telegramBotIds: ['bot-x'],
        }),
      ).resolves.toBeUndefined();
    });

    it('no-ops on empty botId list', async () => {
      await publisher.publishHappyPath({
        clientAgentId: 'ca-1',
        telegramBotIds: [],
      });
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('publishProbe', () => {
    it('enqueues with the 2-attempt reconciler-probe options and stable jobId', async () => {
      await publisher.publishProbe({ telegramBotId: 'bot-9' });

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [, payload, opts] = mockQueue.add.mock.calls[0];
      expect(payload).toEqual({ telegramBotId: 'bot-9' });
      expect(opts.jobId).toBe('tg-webhook:bot-9');
      expect(opts.attempts).toBe(2);
      expect(opts.backoff).toEqual({
        type: 'telegram-webhook-reconciler-backoff',
      });
      expect(opts.removeOnFail).toEqual({ count: 1000 });
    });

    it('swallows enqueue errors', async () => {
      mockQueue.add.mockRejectedValueOnce(new Error('redis-down'));
      await expect(
        publisher.publishProbe({ telegramBotId: 'bot-x' }),
      ).resolves.toBeUndefined();
    });
  });
});
