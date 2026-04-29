import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { decryptRecord } from '@shared/crypto.util';
import {
  deriveTelegramWebhookSecret,
  timingSafeEqualHex,
} from '@shared/telegram-webhook-secret.util';

/**
 * Validates Telegram webhook `X-Telegram-Bot-Api-Secret-Token` against hires.
 * Lives in orchestration (not transport) so channels/ never imports repositories.
 */
@Injectable()
export class TelegramWebhookAuthService {
  private readonly logger = new Logger(TelegramWebhookAuthService.name);

  constructor(private readonly clientAgentRepository: ClientAgentRepository) {}

  /**
   * Ensures at least one active hire for `telegramBotId` exists and the header
   * matches SHA-256(UTF-8(botToken)) for that hire's decrypted token.
   */
  async assertValidWebhookSecret(
    telegramBotId: string,
    secretHeader: string | undefined,
  ): Promise<void> {
    const trimmedHeader = secretHeader?.trim();
    if (!trimmedHeader) {
      throw new ForbiddenException('Missing Telegram webhook secret');
    }

    const agents = await this.clientAgentRepository.findActiveByTelegramBotId(
      telegramBotId,
    );

    if (agents.length === 0) {
      this.logger.warn(
        `event=telegram_webhook_auth_failed reason=no_active_hire telegramBotId=${telegramBotId}`,
      );
      throw new ForbiddenException('Unknown Telegram bot');
    }

    const expectedSecrets: string[] = [];

    for (const agent of agents) {
      for (const ch of agent.channels) {
        if (ch.status !== 'active' || ch.telegramBotId !== telegramBotId) {
          continue;
        }
        if (!ch.credentials || typeof ch.credentials !== 'object') {
          continue;
        }
        let botToken: string;
        try {
          const decrypted = decryptRecord(
            ch.credentials as Record<string, unknown>,
          );
          botToken =
            typeof decrypted?.botToken === 'string' ? decrypted.botToken : '';
        } catch {
          continue;
        }
        if (!botToken) {
          continue;
        }
        expectedSecrets.push(deriveTelegramWebhookSecret(botToken));
      }
    }

    const ok = expectedSecrets.some((expected) =>
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
