import { Module } from '@nestjs/common';
import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { BillingGeneratorService } from './billing-generator.service';
import { AgentModule } from '@agent/agent.module';
import { DomainModule } from '@domain/domain.module';

@Module({
  imports: [AgentModule, DomainModule],
  providers: [
    IncomingMessageOrchestrator,
    ContactIdentityResolver,
    QuotaEnforcementService,
    BillingGeneratorService,
  ],
  exports: [IncomingMessageOrchestrator, BillingGeneratorService],
})
export class OrchestratorModule {}
