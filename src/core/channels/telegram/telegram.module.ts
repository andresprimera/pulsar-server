import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';
import { TELEGRAM_WEBHOOK_QUEUE_NAME } from '@orchestrator/jobs/contracts/webhook-registration.contract';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramWebhookRegistrar } from './webhook/telegram-webhook.registrar';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Module({
  imports: [
    OrchestratorModule,
    BullModule.registerQueue({ name: TELEGRAM_WEBHOOK_QUEUE_NAME }),
  ],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    ...(isWorkerMode ? [TelegramWebhookRegistrar] : []),
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
