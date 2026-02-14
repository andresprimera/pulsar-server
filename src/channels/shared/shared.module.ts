import { Module } from '@nestjs/common';
import { MessagePersistenceService } from './message-persistence.service';
import { AgentModule } from '../../agent/agent.module';

@Module({
  imports: [AgentModule],
  providers: [MessagePersistenceService],
  exports: [MessagePersistenceService],
})
export class SharedChannelModule {}
