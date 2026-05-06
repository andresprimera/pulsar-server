import { ConfigService } from '@nestjs/config';
import {
  PermanentJobError,
  RecoverableJobError,
} from '@orchestrator/errors/job-errors';
import { TELEGRAM_WEBHOOK_REGISTER_JOB } from '@orchestrator/jobs/contracts/webhook-registration.contract';
import { TelegramWebhookRegistrar } from './telegram-webhook.registrar';

const PUBLIC_BASE_URL = 'https://api.example.com';
const BOT_ID = '123456789';
const BOT_TOKEN = '123456789:ABCDEF1234567890abcdef1234567890ABC';

function createRegistrar(deps: {
  lifecycle: any;
  telegramService: any;
  metrics?: any;
  deadLetter?: any;
  configService?: ConfigService;
}): TelegramWebhookRegistrar {
  const metrics = deps.metrics ?? {
    recordJobStarted: jest.fn(),
    recordJobCompleted: jest.fn(),
    recordJobFailed: jest.fn(),
  };
  const deadLetter = deps.deadLetter ?? {
    moveToDeadLetter: jest.fn().mockResolvedValue(undefined),
  };
  const configService =
    deps.configService ??
    ({ get: jest.fn().mockReturnValue(PUBLIC_BASE_URL) } as any);

  // Instantiate without invoking @Processor framework (no worker connection).
  const registrar = Object.create(
    TelegramWebhookRegistrar.prototype,
  ) as TelegramWebhookRegistrar;
  (registrar as any).lifecycle = deps.lifecycle;
  (registrar as any).telegramService = deps.telegramService;
  (registrar as any).metrics = metrics;
  (registrar as any).deadLetter = deadLetter;
  (registrar as any).configService = configService;
  (registrar as any).logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  return registrar;
}

function makeJob(overrides: Partial<{ name: string; data: any }> = {}): any {
  return {
    id: 'job-1',
    name: TELEGRAM_WEBHOOK_REGISTER_JOB,
    data: { telegramBotId: BOT_ID },
    attemptsMade: 0,
    opts: { attempts: 6 },
    ...overrides,
  };
}

// Encrypted credentials in non-production are stored verbatim (see crypto.util).
const ENCRYPTED_CREDENTIALS = { botToken: BOT_TOKEN };

describe('TelegramWebhookRegistrar', () => {
  it('short-circuits in-memory when stored fingerprint matches and status registered', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockImplementation(async () => ({
        encryptedCredentials: ENCRYPTED_CREDENTIALS,
        webhookRegistration: {
          status: 'registered',
          fingerprint: 'PLACEHOLDER',
        },
      })),
      recordOutcome: jest.fn(),
    };
    const telegramService: any = {
      lifecycle: { registerWebhook: jest.fn() },
    };

    // First, do a "registering" call to discover the actual fingerprint.
    lifecycle.loadForRegistration.mockResolvedValueOnce({
      encryptedCredentials: ENCRYPTED_CREDENTIALS,
      webhookRegistration: undefined,
    });
    lifecycle.recordOutcome.mockResolvedValueOnce({ matched: true });
    telegramService.lifecycle.registerWebhook.mockResolvedValueOnce({
      registered: true,
      fingerprint: 'PLACEHOLDER',
    });
    lifecycle.recordOutcome.mockResolvedValueOnce({ matched: true });

    const registrar = createRegistrar({ lifecycle, telegramService });

    // First job to compute and persist a fingerprint.
    const firstResult = await registrar.process(makeJob());
    const realFingerprint = firstResult.fingerprint;

    // Second job: lifecycle reports already-registered with matching fingerprint.
    lifecycle.loadForRegistration.mockResolvedValueOnce({
      encryptedCredentials: ENCRYPTED_CREDENTIALS,
      webhookRegistration: {
        status: 'registered',
        fingerprint: realFingerprint,
      },
    });

    const result = await registrar.process(makeJob());
    expect(result).toEqual({ registered: true, fingerprint: realFingerprint });
    expect(telegramService.lifecycle.registerWebhook).toHaveBeenCalledTimes(1);
  });

  it('skips Telegram HTTP call when registering recordOutcome reports no match', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockResolvedValue({
        encryptedCredentials: ENCRYPTED_CREDENTIALS,
        webhookRegistration: undefined,
      }),
      recordOutcome: jest.fn().mockResolvedValueOnce({ matched: false }),
    };
    const telegramService: any = {
      lifecycle: { registerWebhook: jest.fn() },
    };
    const registrar = createRegistrar({ lifecycle, telegramService });

    const result = await registrar.process(makeJob());

    expect(result.registered).toBe(true);
    expect(telegramService.lifecycle.registerWebhook).not.toHaveBeenCalled();
    expect(lifecycle.recordOutcome).toHaveBeenCalledTimes(1);
    expect(lifecycle.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramBotId: BOT_ID,
        status: 'registering',
        fingerprint: expect.any(String),
      }),
    );
  });

  it('marks registered on successful Telegram setWebhook', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockResolvedValue({
        encryptedCredentials: ENCRYPTED_CREDENTIALS,
        webhookRegistration: undefined,
      }),
      recordOutcome: jest
        .fn()
        .mockResolvedValueOnce({ matched: true })
        .mockResolvedValueOnce({ matched: true }),
    };
    const telegramService: any = {
      lifecycle: {
        registerWebhook: jest
          .fn()
          .mockResolvedValue({ registered: true, fingerprint: 'fp' }),
      },
    };

    const registrar = createRegistrar({ lifecycle, telegramService });
    const result = await registrar.process(makeJob());

    expect(result.registered).toBe(true);
    expect(lifecycle.recordOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        telegramBotId: BOT_ID,
        status: 'registered',
      }),
    );
  });

  it('marks failed and throws PermanentJobError when register returns registered=false', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockResolvedValue({
        encryptedCredentials: ENCRYPTED_CREDENTIALS,
        webhookRegistration: undefined,
      }),
      recordOutcome: jest
        .fn()
        .mockResolvedValueOnce({ matched: true })
        .mockResolvedValueOnce({ matched: true }),
    };
    const telegramService: any = {
      lifecycle: {
        registerWebhook: jest.fn().mockResolvedValue({
          registered: false,
          fingerprint: 'fp',
          error: 'Unauthorized',
        }),
      },
    };

    const registrar = createRegistrar({ lifecycle, telegramService });

    await expect(registrar.process(makeJob())).rejects.toBeInstanceOf(
      PermanentJobError,
    );

    expect(lifecycle.recordOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        telegramBotId: BOT_ID,
        status: 'failed',
        lastError: 'Unauthorized',
      }),
    );
  });

  it('marks failed and re-throws when registerWebhook throws RecoverableJobError', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockResolvedValue({
        encryptedCredentials: ENCRYPTED_CREDENTIALS,
        webhookRegistration: undefined,
      }),
      recordOutcome: jest
        .fn()
        .mockResolvedValueOnce({ matched: true })
        .mockResolvedValueOnce({ matched: true }),
    };
    const telegramService: any = {
      lifecycle: {
        registerWebhook: jest
          .fn()
          .mockRejectedValue(new RecoverableJobError('upstream 502')),
      },
    };

    const registrar = createRegistrar({ lifecycle, telegramService });

    await expect(registrar.process(makeJob())).rejects.toBeInstanceOf(
      RecoverableJobError,
    );

    expect(lifecycle.recordOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        telegramBotId: BOT_ID,
        status: 'failed',
        lastError: 'upstream 502',
      }),
    );
  });

  it('passes large lastError messages through to recordOutcome (truncation enforced at persistence)', async () => {
    const longMessage = 'x'.repeat(5000);
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockResolvedValue({
        encryptedCredentials: ENCRYPTED_CREDENTIALS,
        webhookRegistration: undefined,
      }),
      recordOutcome: jest
        .fn()
        .mockResolvedValueOnce({ matched: true })
        .mockResolvedValueOnce({ matched: true }),
    };
    const telegramService: any = {
      lifecycle: {
        registerWebhook: jest
          .fn()
          .mockRejectedValue(new RecoverableJobError(longMessage)),
      },
    };
    const registrar = createRegistrar({ lifecycle, telegramService });

    await expect(registrar.process(makeJob())).rejects.toBeInstanceOf(
      RecoverableJobError,
    );

    expect(lifecycle.recordOutcome).toHaveBeenLastCalledWith(
      expect.objectContaining({
        telegramBotId: BOT_ID,
        status: 'failed',
        lastError: longMessage,
      }),
    );
  });

  it('throws PermanentJobError when PUBLIC_BASE_URL is missing', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn(),
      recordOutcome: jest.fn(),
    };
    const telegramService: any = { lifecycle: { registerWebhook: jest.fn() } };
    const configService: any = { get: jest.fn().mockReturnValue(undefined) };
    const registrar = createRegistrar({
      lifecycle,
      telegramService,
      configService,
    });

    await expect(registrar.process(makeJob())).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  it('throws PermanentJobError when hire is not found', async () => {
    const lifecycle: any = {
      loadForRegistration: jest.fn().mockResolvedValue(null),
      recordOutcome: jest.fn(),
    };
    const telegramService: any = { lifecycle: { registerWebhook: jest.fn() } };
    const registrar = createRegistrar({ lifecycle, telegramService });

    await expect(registrar.process(makeJob())).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });
});
