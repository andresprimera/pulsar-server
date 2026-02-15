import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AgentModule } from '../../agent/agent.module';
import { WhatsappRoutingService } from './whatsapp-routing.service';

@Module({
  imports: [AgentModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappRoutingService],
})
export class WhatsappModule {}
