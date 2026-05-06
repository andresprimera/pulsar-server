import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
import { TelegramWebhookAuthService } from './telegram-webhook-auth.service';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { BillingGeneratorService } from './billing-generator.service';
import {
  DistributedLockService,
  REDIS_PROVIDER,
} from './distributed-lock.service';
import { BillingJobScheduler } from './jobs/billing/billing-job.scheduler';
import { BillingJobProcessor } from './jobs/billing/billing-job.processor';
import { BILLING_QUEUE_NAME } from './jobs/contracts/billing-job.contract';
import { BILLING_DLQ_NAME } from './jobs/contracts/dead-letter.contract';
import { TELEGRAM_WEBHOOK_QUEUE_NAME } from './jobs/contracts/webhook-registration.contract';
import { JOB_DEFINITIONS } from './jobs/registry/job-registry';
import { JobMetricsService } from './observability/job-metrics.service';
import { QueueHealthService } from './observability/queue-health.service';
import { DeadLetterService } from './observability/dead-letter.service';
import { WebhookRegistrationCoordinator } from './jobs/webhook/webhook-registration.coordinator';
import { AgentModule } from '@agent/agent.module';
import { DomainModule } from '@domain/domain.module';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Module({
  imports: [
    AgentModule,
    DomainModule,
    ...(isWorkerMode ? [] : [ScheduleModule.forRoot()]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const uri =
          configService.get<string>('REDIS_URI') ?? 'redis://localhost:6379';
        const url = new URL(uri);
        return {
          connection: {
            host: url.hostname,
            port: url.port ? parseInt(url.port, 10) : 6379,
            password: url.password || undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: BILLING_QUEUE_NAME,
      defaultJobOptions: JOB_DEFINITIONS.billingGenerateAll.defaultOptions,
    }),
    BullModule.registerQueue({
      name: BILLING_DLQ_NAME,
      defaultJobOptions: { removeOnComplete: { count: 5000 } },
    }),
    BullModule.registerQueue({
      name: TELEGRAM_WEBHOOK_QUEUE_NAME,
      defaultJobOptions: JOB_DEFINITIONS.telegramWebhookRegister.defaultOptions,
    }),
  ],
  providers: [
    {
      provide: REDIS_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const uri =
          configService.get<string>('REDIS_URI') ?? 'redis://localhost:6379';
        return new Redis(uri);
      },
      inject: [ConfigService],
    },
    DistributedLockService,
    IncomingMessageOrchestrator,
    TelegramWebhookAuthService,
    ContactIdentityResolver,
    QuotaEnforcementService,
    BillingGeneratorService,
    JobMetricsService,
    WebhookRegistrationCoordinator,
    ...(isWorkerMode
      ? [QueueHealthService, DeadLetterService, BillingJobProcessor]
      : [BillingJobScheduler]),
  ],
  exports: [
    IncomingMessageOrchestrator,
    TelegramWebhookAuthService,
    BillingGeneratorService,
    WebhookRegistrationCoordinator,
    JobMetricsService,
    ...(isWorkerMode ? [DeadLetterService] : []),
  ],
})
export class OrchestratorModule {}
