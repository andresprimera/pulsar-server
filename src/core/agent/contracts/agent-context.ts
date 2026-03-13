import { LlmProvider } from '@domain/llm/provider.enum';

export interface AgentContext {
  agentId: string;
  agentName?: string;
  clientId: string;
  clientName?: string;
  channelId: string;
  systemPrompt: string;
  personality?: {
    id: string;
    name: string;
    promptTemplate: string;
  };
  /** Optional client brand voice instructions; refines tone alongside personality. */
  brandVoice?: string;
  llmConfig: {
    provider: LlmProvider;
    apiKey: string;
    model: string;
  };
  channelConfig?: Record<string, unknown>;
}
