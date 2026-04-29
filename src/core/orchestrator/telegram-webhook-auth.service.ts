import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { timingSafeEqualHex } from '@shared/telegram-webhook-secret.util';

/**
 * Validates Telegram webhook `X-Telegram-Bot-Api-Secret-Token` against hires.
 * Uses {@link HireChannelConfig.telegramWebhookSecretHex} only (no credential decrypt).
 * Lives in orchestration (not transport) so channels/ never imports repositories.
 */
@Injectable()
export class TelegramWebhookAuthService {
  private readonly logger = new Logger(TelegramWebhookAuthService.name);

  constructor(private readonly clientAgentRepository: ClientAgentRepository) {}

  /**
   * Ensures at least one active hire for `telegramBotId` exists and the header
   * matches a stored `telegramWebhookSecretHex` (set at hire from SHA-256(botToken)).
   */
  async assertValidWebhookSecret(
    telegramBotId: string,
    secretHeader: string | undefined,
  ): Promise<void> {
    const trimmedHeader = secretHeader?.trim().toLowerCase();
    if (!trimmedHeader) {
      throw new ForbiddenException('Missing Telegram webhook secret');
    }

    const agents =
      await this.clientAgentRepository.findActiveByTelegramBotIdForWebhookAuth(
        telegramBotId,
      );

    if (agents.length === 0) {
      this.logger.warn(
        `event=telegram_webhook_auth_failed reason=no_active_hire telegramBotId=${telegramBotId}`,
      );
      throw new ForbiddenException('Unknown Telegram bot');
    }

    const expectedHexes: string[] = [];

    for (const agent of agents) {
      for (const ch of agent.channels) {
        if (ch.status !== 'active' || ch.telegramBotId !== telegramBotId) {
          continue;
        }
        const hex = ch.telegramWebhookSecretHex?.trim().toLowerCase();
        if (!hex) {
          continue;
        }
        expectedHexes.push(hex);
      }
    }

    const ok = expectedHexes.some((expected) =>
      timingSafeEqualHex(trimmedHeader, expected),
    );

    if (!ok) {
      this.logger.warn(
        `event=telegram_webhook_auth_failed reason=secret_mismatch telegramBotId=${telegramBotId}`,
      );
      throw new ForbiddenException('Invalid Telegram webhook secret');
    }
  }
}
