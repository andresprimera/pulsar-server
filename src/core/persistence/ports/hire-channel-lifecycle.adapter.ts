import { Injectable } from '@nestjs/common';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { HireChannelConfig } from '@persistence/schemas/client-agent.schema';
import {
  HireChannelLifecyclePort,
  WebhookRegistrationStateSnapshot,
} from '@shared/ports/hire-channel-lifecycle.port';

@Injectable()
export class HireChannelLifecycleAdapter implements HireChannelLifecyclePort {
  constructor(private readonly clientAgentRepository: ClientAgentRepository) {}

  recordOutcome(input: {
    telegramBotId: string;
    status: 'registering' | 'registered' | 'failed';
    fingerprint?: string;
    lastError?: string;
  }): Promise<{ matched: boolean }> {
    return this.clientAgentRepository.updateWebhookRegistrationByTelegramBotId(
      input,
    );
  }

  async loadForRegistration(telegramBotId: string): Promise<{
    encryptedCredentials: Record<string, unknown>;
    webhookRegistration?: WebhookRegistrationStateSnapshot;
  } | null> {
    const agents =
      await this.clientAgentRepository.findActiveByTelegramBotIdForWebhookRegistration(
        telegramBotId,
      );
    if (agents.length === 0) return null;
    const ch = agents[0].channels.find(
      (c: HireChannelConfig) =>
        c.status === 'active' && c.telegramBotId === telegramBotId,
    );
    if (!ch || !ch.credentials) return null;
    return {
      encryptedCredentials: ch.credentials,
      webhookRegistration: ch.webhookRegistration
        ? { ...ch.webhookRegistration }
        : undefined,
    };
  }
}
