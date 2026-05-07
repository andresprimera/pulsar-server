// If you change CLIENT_AGENT_LIST_PROJECTION, update ClientAgentsService.toSummary and the mapper redaction tests.
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
