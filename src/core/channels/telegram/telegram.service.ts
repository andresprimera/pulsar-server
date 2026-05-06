import { Injectable, Logger } from '@nestjs/common';
import { decryptRecord } from '@shared/crypto.util';
import {
  computeTelegramWebhookFingerprint,
  deriveTelegramWebhookSecret,
} from '@shared/telegram-webhook-secret.util';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { TelegramWebhookAuthService } from '@orchestrator/telegram-webhook-auth.service';
import { IncomingChannelEvent } from '@domain/channels/incoming-channel-event.interface';
import { RecoverableJobError } from '@orchestrator/errors/job-errors';
import {
  ChannelLifecycleAdapter,
  RegisterWebhookInput,
  RegisterWebhookResult,
} from '@channels/channel-lifecycle-adapter.interface';

const TELEGRAM_WEBHOOK_HTTP_TIMEOUT_MS = 5_000;

interface ParsedTelegramTextMessage {
  text: string;
  fromUserId: number;
  chatId: number;
  messageId: number;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  readonly lifecycle: ChannelLifecycleAdapter = {
    channel: CHANNEL_TYPES.TELEGRAM,
    registerWebhook: (input: RegisterWebhookInput) =>
      this.registerWebhookForInput(input),
  };

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
    private readonly telegramWebhookAuth: TelegramWebhookAuthService,
  ) {}

  async handleIncoming(
    telegramBotId: string,
    update: unknown,
    secretHeader: string | undefined,
  ): Promise<void> {
    await this.telegramWebhookAuth.assertValidWebhookSecret(
      telegramBotId,
      secretHeader,
    );

    const parsed = this.parseTextMessageUpdate(update);
    if (!parsed) {
      return;
    }

    const incomingEvent: IncomingChannelEvent = {
      channelId: CHANNEL_TYPES.TELEGRAM,
      routeChannelIdentifier: telegramBotId,
      channelIdentifier: String(parsed.fromUserId),
      messageId: `${parsed.chatId}:${parsed.messageId}`,
      text: parsed.text,
      rawPayload: update,
    };

    const output = await this.incomingMessageOrchestrator.handle(incomingEvent);
    if (!output?.reply?.text) {
      return;
    }

    let botToken: string;
    try {
      botToken = this.resolveBotTokenOrThrow(
        output.channelMeta?.encryptedCredentials,
      );
    } catch (err) {
      this.logger.warn(
        `[Telegram] Unable to send outbound for telegramBotId=${telegramBotId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    await this.sendTextMessage(botToken, parsed.chatId, output.reply.text);
  }

  parseTextMessageUpdate(update: unknown): ParsedTelegramTextMessage | null {
    const u = update as Record<string, unknown> | null;
    const message = u?.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== 'object') {
      return null;
    }

    const text = message.text;
    if (typeof text !== 'string' || !text.trim()) {
      return null;
    }

    const from = message.from as Record<string, unknown> | undefined;
    const fromId = from?.id;
    if (typeof fromId !== 'number' && typeof fromId !== 'string') {
      return null;
    }
    const fromUserId =
      typeof fromId === 'number' ? fromId : Number.parseInt(String(fromId), 10);
    if (!Number.isFinite(fromUserId)) {
      return null;
    }

    const chat = message.chat as Record<string, unknown> | undefined;
    const chatIdRaw = chat?.id;
    if (typeof chatIdRaw !== 'number' && typeof chatIdRaw !== 'string') {
      return null;
    }
    const chatId =
      typeof chatIdRaw === 'number'
        ? chatIdRaw
        : Number.parseInt(String(chatIdRaw), 10);
    if (!Number.isFinite(chatId)) {
      return null;
    }

    const messageIdRaw = message.message_id;
    if (typeof messageIdRaw !== 'number' && typeof messageIdRaw !== 'string') {
      return null;
    }
    const messageId =
      typeof messageIdRaw === 'number'
        ? messageIdRaw
        : Number.parseInt(String(messageIdRaw), 10);
    if (!Number.isFinite(messageId)) {
      return null;
    }

    return { text, fromUserId, chatId, messageId };
  }

  private resolveBotTokenOrThrow(encryptedCredentials: unknown): string {
    if (
      !encryptedCredentials ||
      typeof encryptedCredentials !== 'object' ||
      Array.isArray(encryptedCredentials)
    ) {
      throw new Error('[Telegram] Missing channel credentials');
    }

    const decrypted = decryptRecord(
      encryptedCredentials as Record<string, unknown>,
    );
    const token = decrypted?.botToken;
    if (typeof token !== 'string' || !token.length) {
      throw new Error('[Telegram] Missing botToken in credentials');
    }
    return token;
  }

  private async sendTextMessage(
    botToken: string,
    chatId: number,
    text: string,
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `[Telegram] sendMessage failed: ${response.status} ${errorBody}`,
      );
      throw new Error(`Telegram API error: ${response.status}`);
    }

    this.logger.log(`[Telegram] Message sent successfully to chatId=${chatId}`);
  }

  private async registerWebhookForInput(
    input: RegisterWebhookInput,
  ): Promise<RegisterWebhookResult> {
    let botToken: string;
    if (input.kind === 'plaintext') {
      botToken = input.botToken;
    } else {
      const decrypted = decryptRecord(input.encryptedCredentials);
      const token = decrypted?.botToken;
      if (typeof token !== 'string' || !token.length) {
        throw new Error('[Telegram] Missing botToken in credentials');
      }
      botToken = token;
    }

    return this.registerWebhookOnce({
      telegramBotId: input.telegramBotId,
      botToken,
      publicBaseUrl: input.publicBaseUrl,
    });
  }

  private async registerWebhookOnce(input: {
    telegramBotId: string;
    botToken: string;
    publicBaseUrl: string;
  }): Promise<RegisterWebhookResult> {
    const url = `${input.publicBaseUrl}/telegram/webhook/${input.telegramBotId}`;
    const secretToken = deriveTelegramWebhookSecret(input.botToken);
    const fingerprint = computeTelegramWebhookFingerprint(url, secretToken);

    const apiUrl = `https://api.telegram.org/bot${input.botToken}/setWebhook`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TELEGRAM_WEBHOOK_HTTP_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret_token: secretToken,
          drop_pending_updates: false,
          allowed_updates: ['message'],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const message = this.sanitizeTelegramMessage(
        err instanceof Error ? err.message : String(err),
        input.botToken,
      );
      throw new RecoverableJobError(
        `[Telegram] setWebhook network/timeout: ${message}`,
        err,
      );
    } finally {
      clearTimeout(timeout);
    }

    const status = response.status;

    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      bodyText = '';
    }
    const sanitizedBody = this.sanitizeTelegramMessage(
      bodyText,
      input.botToken,
    );

    if (status >= 200 && status < 300) {
      let body: { ok?: boolean; description?: string } | null = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        body = null;
      }
      if (body && body.ok === true) {
        return { registered: true, fingerprint };
      }
      const description = body?.description
        ? this.sanitizeTelegramMessage(body.description, input.botToken)
        : sanitizedBody || `status=${status}`;
      return { registered: false, fingerprint, error: description };
    }

    if (status === 400 || status === 401 || status === 403) {
      return {
        registered: false,
        fingerprint,
        error: `Telegram setWebhook rejected: status=${status} body=${sanitizedBody}`,
      };
    }

    if (status === 429 || status >= 500) {
      throw new RecoverableJobError(
        `[Telegram] setWebhook transient failure: status=${status} body=${sanitizedBody}`,
      );
    }

    throw new RecoverableJobError(
      `[Telegram] setWebhook unexpected status=${status} body=${sanitizedBody}`,
    );
  }

  private sanitizeTelegramMessage(message: string, botToken: string): string {
    if (!message) return '';
    const escaped = botToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return message.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
}
