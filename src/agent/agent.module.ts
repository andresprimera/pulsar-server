import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentContextService } from './agent-context.service';
import { SharedChannelModule } from '../channels/shared/shared.module';

@Module({
  imports: [SharedChannelModule],
  providers: [AgentService, AgentContextService],
  exports: [AgentService, AgentContextService],
})
export class AgentModule {}
