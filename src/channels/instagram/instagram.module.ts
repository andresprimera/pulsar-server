import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { AgentModule } from '../../agent/agent.module';
import { SharedChannelModule } from '../shared/shared.module';
import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [InstagramController],
  providers: [InstagramService, IncomingMessageOrchestrator],
})
export class InstagramModule {}
