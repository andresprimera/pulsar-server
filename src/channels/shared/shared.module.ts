import { Module } from '@nestjs/common';
import { MessagePersistenceService } from './message-persistence.service';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { AgentRoutingService } from './agent-routing.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [MessagePersistenceService, ConversationSummaryService, AgentRoutingService],
  exports: [MessagePersistenceService, ConversationSummaryService, AgentRoutingService],
})
export class SharedChannelModule {}
