import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [AgentService, ConversationSummaryService],
  exports: [AgentService, ConversationSummaryService],
})
export class AgentModule {}
