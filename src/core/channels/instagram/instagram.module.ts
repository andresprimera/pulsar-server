import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';

@Module({
  imports: [OrchestratorModule],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
