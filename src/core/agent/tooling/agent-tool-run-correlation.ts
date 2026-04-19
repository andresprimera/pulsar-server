import type { AgentToolingProfileId } from '@shared/agent-tooling-profile.constants';

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
}
