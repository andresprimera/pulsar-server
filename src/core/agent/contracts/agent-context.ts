import { LlmProvider } from '@domain/llm/provider.enum';
import type { AgentToolingProfileId } from '@shared/agent-tooling-profile.constants';
import type { AgentKind } from '@shared/agent-kind.constants';

export type { AgentToolingProfileId } from '@shared/agent-tooling-profile.constants';

export interface AgentContext {
  agentId: string;
  agentName?: string;
  /**
   * Catalog discriminator (kind) for the agent that owns this run. Resolved
   * in {@link AgentContextService.buildContextFromRoute} from the loaded
   * Agent document and preserved through {@link AgentContextService.enrichContext}.
   * Used by {@link PromptBuilderService} (lead-qualifier section gating)
   * and {@link AgentService} (lead-qualifier preflight stub).
   */
  agentKind: AgentKind;
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
  /**
   * Resolved in {@link AgentContextService.buildContextFromRoute} only.
   * Preserved through {@link AgentContextService.enrichContext} without recomputation.
   */
  toolingProfileId: AgentToolingProfileId;
}
