import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ClientContextSuggestionsModule } from '@client-context-suggestions/client-context-suggestions.module';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';

@Module({
  imports: [ClientContextSuggestionsModule, OrchestratorModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
