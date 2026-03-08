import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

// Ensures OrchestratorModule registers processors only (no cron schedulers).
process.env.WORKER_MODE = 'true';

/**
 * Worker process entrypoint. Runs BullMQ queue consumers (e.g. billing job)
 * without starting the HTTP server. Use: node dist/worker.js (after build)
 * or ts-node -r tsconfig-paths/register src/worker.ts (dev).
 *
 * Graceful shutdown: on SIGTERM/SIGINT workers stop accepting new jobs,
 * finish the current job, then close Redis connections and exit.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  app.enableShutdownHooks();
  await app.init();
  // Process stays alive while BullMQ workers are running; no app.listen()
}

bootstrap().catch((err) => {
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
