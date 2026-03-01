import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AgentModule } from '@agent/agent.module';
import { SharedChannelModule } from '@channels/shared/shared.module';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, IncomingMessageOrchestrator],
})
export class WhatsappModule {}
