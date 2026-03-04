import { Module } from '@nestjs/common';
import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { AgentModule } from '@agent/agent.module';
import { DomainModule } from '@domain/domain.module';

@Module({
  imports: [AgentModule, DomainModule],
  providers: [IncomingMessageOrchestrator, ContactIdentityResolver],
  exports: [IncomingMessageOrchestrator],
})
export class OrchestratorModule {}
