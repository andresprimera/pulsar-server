import { Injectable, Logger } from '@nestjs/common';
import { decryptRecord } from '@shared/crypto.util';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { TelegramWebhookAuthService } from '@orchestrator/telegram-webhook-auth.service';
import { IncomingChannelEvent } from '@domain/channels/incoming-channel-event.interface';

interface ParsedTelegramTextMessage {
  text: string;
  fromUserId: number;
  chatId: number;
  messageId: number;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

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
}
