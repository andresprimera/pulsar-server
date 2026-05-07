import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookRegistrationReconciler } from './webhook-registration.reconciler';
import { HireChannelLifecyclePublisher } from './hire-channel-lifecycle.publisher';
import { DistributedLockService } from '@orchestrator/distributed-lock.service';
import {
  HIRE_CHANNEL_LIFECYCLE_PORT,
  HireChannelLifecyclePort,
} from '@shared/ports/hire-channel-lifecycle.port';

describe('WebhookRegistrationReconciler', () => {
  let reconciler: WebhookRegistrationReconciler;
  let mockLock: { acquire: jest.Mock; release: jest.Mock };
  let mockPublisher: jest.Mocked<
    Pick<HireChannelLifecyclePublisher, 'publishProbe'>
  >;
  let mockLifecycle: jest.Mocked<HireChannelLifecyclePort>;

  beforeEach(async () => {
    mockLock = {
      acquire: jest.fn().mockResolvedValue('lock-token'),
      release: jest.fn().mockResolvedValue(undefined),
    };
    mockPublisher = {
      publishProbe: jest.fn().mockResolvedValue(undefined),
    } as any;
    mockLifecycle = {
      recordOutcome: jest.fn().mockResolvedValue({ matched: true }),
      loadForRegistration: jest.fn(),
      quarantineTelegramRegistration: jest
        .fn()
        .mockResolvedValue({ matched: true }),
      findReconcilableTelegramHires: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookRegistrationReconciler,
        { provide: DistributedLockService, useValue: mockLock },
        { provide: HireChannelLifecyclePublisher, useValue: mockPublisher },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        { provide: HIRE_CHANNEL_LIFECYCLE_PORT, useValue: mockLifecycle },
      ],
    }).compile();

    reconciler = module.get(WebhookRegistrationReconciler);
  });

  it('skips the tick when distributed lock is not acquired', async () => {
    mockLock.acquire.mockResolvedValueOnce(null);
    await reconciler.scheduledTick();
    expect(mockLifecycle.findReconcilableTelegramHires).not.toHaveBeenCalled();
  });

  it('quarantines rows whose attemptCount >= threshold (failed status)', async () => {
    mockLifecycle.findReconcilableTelegramHires.mockResolvedValueOnce([
      {
        clientAgentId: 'a',
        telegramBotId: 'bot-q',
        currentStatus: 'failed',
        attemptCount: 4,
      },
    ]);

    await reconciler.scheduledTick();

    expect(mockLifecycle.quarantineTelegramRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ telegramBotId: 'bot-q' }),
    );
    expect(mockPublisher.publishProbe).not.toHaveBeenCalled();
  });

  it('stuck-registering rows take the reset path BEFORE quarantine even at threshold', async () => {
    // Row is BOTH stuck-registering AND attemptCount >= threshold.
    // Per plan §5.3, stuck-reset takes precedence so the row gets one more
    // chance via the failed → registering transition rather than being
    // prematurely quarantined.
    mockLifecycle.findReconcilableTelegramHires.mockResolvedValueOnce([
      {
        clientAgentId: 'a',
        telegramBotId: 'bot-stuck-at-threshold',
        currentStatus: 'registering',
        attemptCount: 4,
      },
    ]);

    await reconciler.scheduledTick();

    expect(mockLifecycle.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramBotId: 'bot-stuck-at-threshold',
        status: 'failed',
        expectStatus: ['registering'],
      }),
    );
    expect(mockLifecycle.quarantineTelegramRegistration).not.toHaveBeenCalled();
    expect(mockPublisher.publishProbe).not.toHaveBeenCalled();
  });

  it('claims pending rows via expectStatus and enqueues a probe', async () => {
    mockLifecycle.findReconcilableTelegramHires.mockResolvedValueOnce([
      {
        clientAgentId: 'a',
        telegramBotId: 'bot-p',
        currentStatus: 'pending',
        attemptCount: 0,
      },
    ]);

    await reconciler.scheduledTick();

    expect(mockLifecycle.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramBotId: 'bot-p',
        status: 'registering',
        expectStatus: ['pending', 'failed', 'absent'],
        incrementAttempt: false,
      }),
    );
    expect(mockPublisher.publishProbe).toHaveBeenCalledWith({
      telegramBotId: 'bot-p',
    });
  });

  it('skips publishProbe when conditional claim returns matched=false (multi-instance dedup)', async () => {
    mockLifecycle.findReconcilableTelegramHires.mockResolvedValueOnce([
      {
        clientAgentId: 'a',
        telegramBotId: 'bot-p',
        currentStatus: 'pending',
        attemptCount: 0,
      },
    ]);
    mockLifecycle.recordOutcome.mockResolvedValueOnce({ matched: false });

    await reconciler.scheduledTick();

    expect(mockPublisher.publishProbe).not.toHaveBeenCalled();
  });

  it('resets stuck-registering rows to failed via expectLastAttemptAtBefore (TOCTOU-safe)', async () => {
    mockLifecycle.findReconcilableTelegramHires.mockResolvedValueOnce([
      {
        clientAgentId: 'a',
        telegramBotId: 'bot-stuck',
        currentStatus: 'registering',
        attemptCount: 1,
      },
    ]);

    await reconciler.scheduledTick();

    expect(mockLifecycle.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramBotId: 'bot-stuck',
        status: 'failed',
        expectStatus: ['registering'],
        expectLastAttemptAtBefore: expect.any(Date),
      }),
    );
    expect(mockPublisher.publishProbe).not.toHaveBeenCalled();
  });

  it('releases the distributed lock even when the tick body throws', async () => {
    mockLifecycle.findReconcilableTelegramHires.mockRejectedValueOnce(
      new Error('mongo-down'),
    );

    await expect(reconciler.scheduledTick()).rejects.toThrow('mongo-down');
    expect(mockLock.release).toHaveBeenCalledWith(
      expect.any(String),
      'lock-token',
    );
  });
});
