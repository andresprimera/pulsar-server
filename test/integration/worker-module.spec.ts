/**
 * Integration test: WorkerModule DI resolution
 *
 * Verifies that the full WorkerModule graph compiles in worker mode.
 *
 * This guards against the regression in which `OrchestratorModule` provided
 * `JobMetricsService` and `DeadLetterService` but did not export them, which
 * meant `TelegramModule` (which only `imports OrchestratorModule`) could not
 * resolve `TelegramWebhookRegistrar`'s constructor dependencies, causing the
 * worker process to crash at startup with:
 *
 *   "Nest can't resolve dependencies of the TelegramWebhookRegistrar
 *    (Symbol(HIRE_CHANNEL_LIFECYCLE_PORT), TelegramService, ?, ...)."
 *
 * The unit test for `TelegramWebhookRegistrar` masked this because it
 * instantiates the class via `Object.create(...prototype)` and bypasses Nest DI.
 *
 * NOTE: this test boots the real `WorkerModule`, which imports `DatabaseModule`
 * (Mongoose) and `OrchestratorModule` (BullMQ → Redis). Running it therefore
 * requires MongoDB and Redis to be reachable — the same prerequisites as
 * `pnpm test:e2e`. It is registered under `pnpm test:integration` and is
 * intentionally excluded from `pnpm test` (the unit suite). When MongoDB is
 * unreachable the test is skipped with a clear message rather than failing on
 * a Mongoose retry timeout, so local dev without MongoDB doesn't get a noisy
 * red signal for an unrelated reason.
 */

// IMPORTANT: env vars must be set BEFORE any modules that read them at
// import time. `OrchestratorModule` and `TelegramModule` both evaluate
// `process.env.WORKER_MODE === 'true'` at top-level constant scope, so the
// assignment must happen before the dynamic require below.
const previousEnv: Record<string, string | undefined> = {
  WORKER_MODE: process.env.WORKER_MODE,
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URI: process.env.REDIS_URI,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

process.env.WORKER_MODE = 'true';
process.env.MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pulsar_test';
process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://localhost:6379';
process.env.PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? 'https://test.local';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

// eslint-disable-next-line
const net = require('net');
// eslint-disable-next-line
const { Test } = require('@nestjs/testing');
// eslint-disable-next-line
const telegramRegistrarModule = require('../../src/core/channels/telegram/webhook/telegram-webhook.registrar');
// eslint-disable-next-line
const jobMetricsModule = require('../../src/core/orchestrator/observability/job-metrics.service');
// eslint-disable-next-line
const deadLetterModule = require('../../src/core/orchestrator/observability/dead-letter.service');
// eslint-disable-next-line
const workerModuleModule = require('../../src/worker.module');

const { TelegramWebhookRegistrar } = telegramRegistrarModule;
const { JobMetricsService } = jobMetricsModule;
const { DeadLetterService } = deadLetterModule;
const { WorkerModule } = workerModuleModule;

function probeTcp(
  host: string,
  port: number,
  timeoutMs = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket: any = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

describe('WorkerModule (integration) — DI resolution', () => {
  afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('compiles in WORKER_MODE=true and resolves TelegramWebhookRegistrar with its observability dependencies', async () => {
    const mongoUri = new URL(process.env.MONGODB_URI as string);
    const redisUri = new URL(process.env.REDIS_URI as string);
    const [mongoUp, redisUp] = await Promise.all([
      probeTcp(mongoUri.hostname, parseInt(mongoUri.port || '27017', 10)),
      probeTcp(redisUri.hostname, parseInt(redisUri.port || '6379', 10)),
    ]);

    if (!mongoUp || !redisUp) {
      // eslint-disable-next-line no-console
      console.warn(
        `[worker-module integration] Skipping: MongoDB up=${mongoUp}, Redis up=${redisUp}. ` +
          'Run with MongoDB and Redis available (same prerequisites as pnpm test:e2e).',
      );
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    // Run `onModuleInit` so BullMQ `WorkerHost` instances initialize their
    // underlying `worker` field. Without this, `onApplicationShutdown`
    // (called during `moduleRef.close()`) throws "Worker has not yet been
    // initialized." The DI resolution check we care about happens during
    // `compile()` above; `init()` only matters for clean teardown.
    await moduleRef.init();

    try {
      // If compilation succeeds, every constructor dependency resolved.
      // Explicitly assert the previously-broken edge: the registrar can be
      // pulled from the container together with the providers it injects
      // from OrchestratorModule.
      const registrar = moduleRef.get(TelegramWebhookRegistrar, {
        strict: false,
      });
      const metrics = moduleRef.get(JobMetricsService, { strict: false });
      const deadLetter = moduleRef.get(DeadLetterService, { strict: false });

      expect(registrar).toBeInstanceOf(TelegramWebhookRegistrar);
      expect(metrics).toBeInstanceOf(JobMetricsService);
      expect(deadLetter).toBeInstanceOf(DeadLetterService);
    } finally {
      await moduleRef.close();
    }
  }, 30000);
});
