import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@persistence/database.module';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';

/**
 * Minimal module for the worker process: only persistence and orchestrator.
 * Used by src/worker.ts so that BullMQ workers run without HTTP or channel modules.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    OrchestratorModule,
  ],
})
export class WorkerModule {}
