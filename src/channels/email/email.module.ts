import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { AgentModule } from '../../agent/agent.module';

@Module({
  imports: [AgentModule],
  controllers: [],
  providers: [EmailService],
})
export class EmailModule {}
