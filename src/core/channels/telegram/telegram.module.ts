import { Module } from '@nestjs/common';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [OrchestratorModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
