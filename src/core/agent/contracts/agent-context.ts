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
    examplePhrases?: string[];
    guardrails?: string;
  };
  /** Org-wide stable context from the client document (trim-non-empty). */
  companyBrief?: string;
  /** Per-hire grounding from the client_agent document (trim-non-empty). */
  promptSupplement?: string;
  llmConfig: {
    provider: LlmProvider;
    apiKey: string;
    model: string;
  };
  channelConfig?: Record<string, unknown>;
}
