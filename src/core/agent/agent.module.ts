import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { AgentContextService } from './agent-context.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { MetadataExposureService } from './metadata-exposure.service';
import { MessagePersistenceService } from '@persistence/message-persistence.service';
import { DomainModule } from '@domain/domain.module';
import { LeadModule } from '@domain/leads/lead.module';
import { ClientContextSuggestionExecutor } from './client-context-suggestion.executor';
import { ClientCatalogImportExecutor } from './client-catalog-import.executor';
import { AgentToolSetBuilderService } from './tooling/agent-tool-set-builder.service';
import { LeadBootstrapService } from './lead-qualifier/lead-bootstrap.service';

@Module({
  imports: [ConfigModule, DomainModule, LeadModule],
  providers: [
    AgentService,
    AgentToolSetBuilderService,
    ClientContextSuggestionExecutor,
    ClientCatalogImportExecutor,
    AgentContextService,
    PromptBuilderService,
    ConversationSummaryService,
    MetadataExposureService,
    MessagePersistenceService,
    LeadBootstrapService,
  ],
  exports: [AgentService, AgentContextService, MetadataExposureService],
})
export class AgentModule {}
