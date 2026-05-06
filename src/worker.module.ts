import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@persistence/database.module';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';
import { TelegramModule } from '@channels/telegram/telegram.module';
import { validateEnv } from './config/env.validate';

/**
 * Minimal module for the worker process: only persistence and orchestrator.
 * Used by src/worker.ts so that BullMQ workers run without HTTP or channel modules.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    OrchestratorModule,
    TelegramModule,
  ],
})
export class WorkerModule {}
