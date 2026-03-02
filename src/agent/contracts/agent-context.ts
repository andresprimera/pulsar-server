import { LlmProvider } from '@domain/llm/provider.enum';

export interface AgentContext {
  agentId: string;
  agentName?: string;
  clientId: string;
  clientName?: string;
  channelId: string;
  systemPrompt: string;
  llmConfig: {
    provider: LlmProvider;
    apiKey: string;
    model: string;
  };
  channelConfig?: Record<string, unknown>;
}
