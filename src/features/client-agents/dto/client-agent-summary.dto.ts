import type { AgentPricingSnapshot } from '@persistence/schemas/client-agent.schema';
import type { AgentKind } from '@shared/agent-kind.constants';

export interface ClientSummary {
  _id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
  billingCurrency: string;
}

export interface AgentSummary {
  _id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
  kind: AgentKind;
}

export interface PersonalitySummary {
  _id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
}

export interface WebhookRegistrationSummary {
  status: 'pending' | 'registering' | 'registered' | 'failed' | 'quarantined';
  lastAttemptAt?: Date | string;
  registeredAt?: Date | string;
  attemptCount: number;
  lastError?: string;
}

export interface ChannelSummary {
  channelId: string;
  provider: string;
  status: 'active' | 'inactive';
  amount: number;
  currency: string;
  monthlyMessageQuota: number | null;
  phoneNumberId?: string;
  tiktokUserId?: string;
  instagramAccountId?: string;
  telegramBotId?: string;
  webhookRegistration?: WebhookRegistrationSummary;
}

export class ClientAgentSummaryDto {
  _id!: string;
  clientId!: string;
  agentId!: string;
  personalityId!: string;
  status!: 'active' | 'inactive' | 'archived';
  agentPricing!: AgentPricingSnapshot;
  billingAnchor!: string | Date;
  toolingProfileId?: string;
  createdAt!: string | Date;
  updatedAt!: string | Date;
  channels!: ChannelSummary[];
  client!: ClientSummary | null;
  agent!: AgentSummary | null;
  personality!: PersonalitySummary | null;
}

export interface PaginatedClientAgentSummary {
  items: ClientAgentSummaryDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
