import type { AgentToolingProfileId } from '@shared/agent-tooling-profile.constants';
import type { AgentKind } from '@shared/agent-kind.constants';

/**
 * Minimal correlation passed into tool factories. No API keys, channel secrets,
 * or full prompts.
 */
export interface AgentToolRunCorrelation {
  clientId: string;
  conversationId: string;
  agentId: string;
  channelId: string;
  contactId: string;
  toolingProfileId: AgentToolingProfileId;
  /**
   * Catalog `kind` of the agent driving this run. Surfaced to tool
   * factories so kind-gated tools can reason about origin without
   * re-loading the Agent document.
   */
  agentKind: AgentKind;
}
