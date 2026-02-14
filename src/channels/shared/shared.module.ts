import { Module } from '@nestjs/common';
import { MessagePersistenceService } from './message-persistence.service';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [MessagePersistenceService, ConversationSummaryService],
  exports: [MessagePersistenceService, ConversationSummaryService],
})
export class SharedChannelModule {}
