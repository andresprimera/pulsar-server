/**
 * Agent LLM tooling profiles (AI SDK tool bundles). Shared so persistence
 * schemas can use the same enum literals without importing `@agent/`.
 */
export const AGENT_TOOLING_PROFILE_IDS = [
  'standard',
  'internal-debug',
  'sales-catalog',
] as const;

export type AgentToolingProfileId = (typeof AGENT_TOOLING_PROFILE_IDS)[number];

export function isAgentToolingProfileId(
  value: string,
): value is AgentToolingProfileId {
  return (AGENT_TOOLING_PROFILE_IDS as readonly string[]).includes(value);
}

export const CHAT_STANDARD_TOOLING_PROFILE_ID: AgentToolingProfileId =
  'standard';

/**
 * When hire/catalog field is missing or invalid, inbound chat uses this profile (no tools).
 */
export function defaultAgentToolingProfileId(): AgentToolingProfileId {
  return CHAT_STANDARD_TOOLING_PROFILE_ID;
}
