import { Module } from '@nestjs/common';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';
import { AgentModule } from '../../agent/agent.module';
import { SharedChannelModule } from '../shared/shared.module';
import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [TiktokController],
  providers: [TiktokService, IncomingMessageOrchestrator],
})
export class TiktokModule {}
