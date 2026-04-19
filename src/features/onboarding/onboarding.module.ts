import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ClientContextSuggestionsModule } from '@client-context-suggestions/client-context-suggestions.module';

@Module({
  imports: [ClientContextSuggestionsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
