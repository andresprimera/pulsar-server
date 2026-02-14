import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { AgentModule } from '../../agent/agent.module';
import { SharedChannelModule } from '../shared/shared.module';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [],
  providers: [EmailService],
})
export class EmailModule {}
