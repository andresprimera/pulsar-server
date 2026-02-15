import { Module } from '@nestjs/common';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';
import { AgentModule } from '../../agent/agent.module';

@Module({
  imports: [AgentModule],
  controllers: [TiktokController],
  providers: [TiktokService],
})
export class TiktokModule {}
