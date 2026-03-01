import { Module } from '@nestjs/common';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';
import { AgentModule } from '@agent/agent.module';
import { SharedChannelModule } from '@channels/shared/shared.module';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [TiktokController],
  providers: [TiktokService, IncomingMessageOrchestrator],
})
export class TiktokModule {}
