import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentContextService } from './agent-context.service';
import { SharedChannelModule } from '@channels/shared/shared.module';
import { MetadataExposureService } from './metadata-exposure.service';

@Module({
  imports: [SharedChannelModule],
  providers: [AgentService, AgentContextService, MetadataExposureService],
  exports: [AgentService, AgentContextService, MetadataExposureService],
})
export class AgentModule {}
