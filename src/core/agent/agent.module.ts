import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { AgentContextService } from './agent-context.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { MetadataExposureService } from './metadata-exposure.service';
import { MessagePersistenceService } from '@persistence/message-persistence.service';
import { DomainModule } from '@domain/domain.module';

@Module({
  imports: [ConfigModule, DomainModule],
  providers: [
    AgentService,
    AgentContextService,
    PromptBuilderService,
    ConversationSummaryService,
    MetadataExposureService,
    MessagePersistenceService,
  ],
  exports: [AgentService, AgentContextService, MetadataExposureService],
})
export class AgentModule {}
