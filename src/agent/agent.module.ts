import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { SharedChannelModule } from '../channels/shared/shared.module';

@Module({
  imports: [SharedChannelModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
