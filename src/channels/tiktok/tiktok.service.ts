import { Injectable, Logger } from '@nestjs/common';
import { decryptRecord } from '@database/utils/crypto.util';
import {
  buildMessagesUrl,
  loadTikTokConfig,
  TikTokServerConfig,
} from './tiktok.config';
import { CHANNEL_TYPES } from '@channels/shared/channel-type.constants';
import { IncomingMessageOrchestrator } from '@agent/incoming-message.orchestrator';
import { IncomingChannelEvent } from '@channels/shared/incoming-channel-event.interface';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);
  private readonly config: TikTokServerConfig;

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
  ) {
    this.config = loadTikTokConfig();
  }

  async handleIncoming(payload: any): Promise<void> {
    // TODO (Phase C): Add idempotency guard using (channelId + messageId)
    this.logger.log(`[TikTok] Incoming message event`);

    if (payload?.event !== 'message.received') {
      return;
    }

    const data = payload.data;
    if (!data?.message || data.message.type !== 'text') {
      return;
    }

    const recipientUserId = data.recipient?.user_id;
    if (!recipientUserId) {
      this.logger.warn('[TikTok] Missing recipient.user_id in payload.');
      return;
    }

    const senderUserId = data.sender?.user_id;
    if (!senderUserId) {
      this.logger.warn('[TikTok] Missing sender.user_id in payload.');
      return;
    }

    const messageText = data.message?.text;
    if (!messageText) {
      this.logger.warn('[TikTok] Missing message.text in payload.');
      return;
    }

    const conversationId = data.conversation_id;
    if (!conversationId) {
      this.logger.warn('[TikTok] Missing conversation_id in payload.');
      return;
    }

    const messageId = data.message_id;
    if (!messageId) {
      this.logger.warn('[TikTok] Missing message_id in payload.');
      return;
    }

    this.logger.log(
      `[TikTok] Incoming message recipientUserId=${recipientUserId} senderUserId=${senderUserId} messageId=${messageId}`,
    );

    const incomingEvent: IncomingChannelEvent = {
      channelId: CHANNEL_TYPES.TIKTOK,
      routeChannelIdentifier: recipientUserId,
      channelIdentifier: senderUserId,
      messageId,
      text: messageText,
      rawPayload: payload,
    };

    const output = await this.incomingMessageOrchestrator.handle(incomingEvent);
    if (!output?.reply) {
      return;
    }

    const accessToken = this.resolveAccessTokenFromChannelConfig(
      output.channelMeta?.encryptedCredentials,
    );
    if (!accessToken) {
      this.logger.warn(
        `[TikTok] Unable to send outbound message for tiktokUserId=${recipientUserId}: missing credentials.`,
      );
      return;
    }

    this.logger.log(`[TikTok] Sending reply to sender=${data.sender.user_id}`);

    try {
      await this.sendMessage({
        recipientId: senderUserId,
        conversationId,
        text: output.reply.text,
        accessToken,
      });
      this.logger.log(`[TikTok] Reply sent successfully.`);
    } catch (error) {
      this.logger.error(
        `[TikTok] Failed to send reply: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveAccessTokenFromChannelConfig(
    encryptedCredentials: unknown,
  ): string | undefined {
    if (
      !encryptedCredentials ||
      typeof encryptedCredentials !== 'object' ||
      Array.isArray(encryptedCredentials)
    ) {
      return undefined;
    }

    const decryptedCredentials = decryptRecord(
      encryptedCredentials as Record<string, any>,
    );
    return decryptedCredentials.accessToken;
  }

  private async sendMessage(params: {
    recipientId: string;
    conversationId: string;
    text: string;
    accessToken: string;
  }): Promise<void> {
    const { recipientId, conversationId, text, accessToken } = params;

    const url = buildMessagesUrl(this.config);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: recipientId,
        conversation_id: conversationId,
        message_type: 'text',
        text: {
          content: text,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TikTok API error: ${response.status} ${errorText}`);
    }
  }
}
