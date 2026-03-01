import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { AgentContextService } from './agent-context.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { MetadataExposureService } from './metadata-exposure.service';
import { MessagePersistenceService } from '@persistence/message-persistence.service';
import { ConversationService } from '@domain/conversation/conversation.service';

@Module({
  imports: [ConfigModule],
  providers: [
    AgentService,
    AgentContextService,
    ConversationSummaryService,
    MetadataExposureService,
    MessagePersistenceService,
    ConversationService,
  ],
  exports: [AgentService, AgentContextService, MetadataExposureService],
})
export class AgentModule {}
