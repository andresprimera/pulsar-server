// If you change CLIENT_AGENT_LIST_PROJECTION, update ClientAgentsService.toSummary and the mapper redaction tests.
// If you change CLIENT_AGENT_CLIENT_LIST_PROJECTION, update ClientAgentsService.toClientSummary and the client-tier mapper redaction tests.
import type { ClientAgent } from '@persistence/schemas/client-agent.schema';

export const CLIENT_AGENT_LIST_PROJECTION = [
  '_id',
  'clientId',
  'agentId',
  'personalityId',
  'status',
  'agentPricing',
  'billingAnchor',
  'toolingProfileId',
  'createdAt',
  'updatedAt',
  'channels.channelId',
  'channels.provider',
  'channels.status',
  'channels.amount',
  'channels.currency',
  'channels.monthlyMessageQuota',
  'channels.phoneNumberId',
  'channels.tiktokUserId',
  'channels.instagramAccountId',
  'channels.telegramBotId',
  'channels.webhookRegistration.status',
  'channels.webhookRegistration.lastAttemptAt',
  'channels.webhookRegistration.registeredAt',
  'channels.webhookRegistration.attemptCount',
  'channels.webhookRegistration.lastError',
] as const;

export const CLIENT_AGENT_LIST_PROJECTION_STRING =
  CLIENT_AGENT_LIST_PROJECTION.join(' ');

/**
 * Top-level field keys included in CLIENT_AGENT_LIST_PROJECTION.
 *
 * The projection array contains dotted subfield paths (e.g. `channels.foo`),
 * but the type below only lists top-level keys to make
 * `Pick<ClientAgent, ClientAgentListProjectedField>` valid. The mapper
 * (ClientAgentsService.toSummary) handles channel sub-projection internally.
 */
export type ClientAgentListProjectedField =
  | '_id'
  | 'clientId'
  | 'agentId'
  | 'personalityId'
  | 'status'
  | 'agentPricing'
  | 'billingAnchor'
  | 'toolingProfileId'
  | 'createdAt'
  | 'updatedAt'
  | 'channels';

export type ClientAgentListProjection = Pick<
  ClientAgent,
  ClientAgentListProjectedField
>;

/**
 * Client-tier slim projection for `GET /client-agents/me` (agent picker).
 * Strict allowlist — excludes `clientId` (the caller already knows their own
 * tenant), `personalityId`, `agentPricing`, `billingAnchor`, `toolingProfileId`,
 * `channels`, `updatedAt`, and any future sensitive field. Adding a field to
 * `ClientAgent` cannot leak through this code path because the projection is
 * server-side allowlist and the wire mapper is field-by-field whitelist.
 */
export const CLIENT_AGENT_CLIENT_LIST_PROJECTION = [
  '_id',
  'status',
  'agentId',
  'createdAt',
] as const;

export const CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING =
  CLIENT_AGENT_CLIENT_LIST_PROJECTION.join(' ');

export type ClientAgentClientListProjectedField =
  | '_id'
  | 'status'
  | 'agentId'
  | 'createdAt';

export type ClientAgentClientListProjection = Pick<
  ClientAgent,
  ClientAgentClientListProjectedField
>;
