import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AgentModule } from '../../agent/agent.module';
import { SharedChannelModule } from '../shared/shared.module';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
