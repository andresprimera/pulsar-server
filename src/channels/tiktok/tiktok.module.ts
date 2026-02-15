import { Module } from '@nestjs/common';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';
import { AgentModule } from '../../agent/agent.module';
import { SharedChannelModule } from '../shared/shared.module';

@Module({
  imports: [AgentModule, SharedChannelModule],
  controllers: [TiktokController],
  providers: [TiktokService],
})
export class TiktokModule {}
