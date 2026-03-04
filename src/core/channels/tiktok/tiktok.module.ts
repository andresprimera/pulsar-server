import { Module } from '@nestjs/common';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';

@Module({
  imports: [OrchestratorModule],
  controllers: [TiktokController],
  providers: [TiktokService],
})
export class TiktokModule {}
