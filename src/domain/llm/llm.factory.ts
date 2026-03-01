import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { LanguageModel } from 'ai';
import { LlmProvider } from './provider.enum';

export interface LLMConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

export function createLLMModel(config: LLMConfig): LanguageModel {
  switch (config.provider) {
    case LlmProvider.OpenAI: {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    case LlmProvider.Anthropic: {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
