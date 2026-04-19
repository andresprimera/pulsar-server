import { Module } from '@nestjs/common';
import { AgentModule } from '@agent/agent.module';
import { ClientContextSuggestionService } from './client-context-suggestion.service';
import { ClientContextSuggestionsController } from './client-context-suggestions.controller';

@Module({
  imports: [AgentModule],
  controllers: [ClientContextSuggestionsController],
  providers: [ClientContextSuggestionService],
  exports: [ClientContextSuggestionService],
})
export class ClientContextSuggestionsModule {}
