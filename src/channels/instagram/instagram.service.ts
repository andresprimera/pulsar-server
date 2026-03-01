import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { decryptRecord } from '@shared/crypto.util';
import {
  InstagramServerConfig,
  loadInstagramConfig,
  buildMessagesUrl,
} from './instagram.config';
import { CHANNEL_TYPES } from '@channels/shared/channel-type.constants';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { IncomingChannelEvent } from '@channels/shared/incoming-channel-event.interface';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly config: InstagramServerConfig;
  private readonly responseWindowMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
  ) {
    this.config = loadInstagramConfig();
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
  }

  private isValidSignature(
    payload: unknown,
    signatureHeader?: string,
    rawBody?: Buffer,
  ): boolean {
    if (!this.config.appSecret) {
      return true;
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const providedDigest = signatureHeader.replace('sha256=', '');
    const body = rawBody ? rawBody.toString('utf8') : JSON.stringify(payload);
    const expectedDigest = createHmac('sha256', this.config.appSecret)
      .update(body)
      .digest('hex');

    const provided = Buffer.from(
      providedDigest,
      'utf8',
    ) as unknown as Uint8Array;
    const expected = Buffer.from(
      expectedDigest,
      'utf8',
    ) as unknown as Uint8Array;

    if (provided.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(provided, expected);
  }

  private resolveMessagingPolicy(messageTimestamp?: number): {
    messagingType: 'RESPONSE' | 'MESSAGE_TAG';
    tag?: 'HUMAN_AGENT';
  } {
    if (!messageTimestamp) {
      return { messagingType: 'RESPONSE' };
    }

    const ageMs = Date.now() - messageTimestamp;
    if (ageMs <= this.responseWindowMs) {
      return { messagingType: 'RESPONSE' };
    }

    return {
      messagingType: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
    };
  }

  private async sendMessage(params: {
    recipientId: string;
    text: string;
    accessToken: string;
    messageTimestamp?: number;
  }): Promise<void> {
    const { recipientId, text, accessToken, messageTimestamp } = params;
    const url = buildMessagesUrl(this.config);
    const policy = this.resolveMessagingPolicy(messageTimestamp);

    const body: Record<string, unknown> = {
      recipient: { id: recipientId },
      message: { text },
      messaging_type: policy.messagingType,
    };

    if (policy.tag) {
      body.tag = policy.tag;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `[Instagram] Failed to send message: ${response.status} ${errorBody}`,
      );
      throw new Error(`Instagram API error: ${response.status}`);
    }

    this.logger.log(`[Instagram] Message sent successfully to ${recipientId}`);
  }

  async handleIncoming(
    payload: any,
    signatureHeader?: string,
    rawBody?: Buffer,
  ): Promise<void> {
    if (!this.isValidSignature(payload, signatureHeader, rawBody)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const entries = payload?.entry;
    if (!Array.isArray(entries)) {
      return;
    }

    for (const entry of entries) {
      const events = entry?.messaging;
      if (!Array.isArray(events)) {
        continue;
      }

      for (const event of events) {
        const text = event?.message?.text;
        const senderId = event?.sender?.id;
        const instagramAccountId = event?.recipient?.id;

        if (!text || !senderId || !instagramAccountId) {
          continue;
        }

        const incomingEvent: IncomingChannelEvent = {
          channelId: CHANNEL_TYPES.INSTAGRAM,
          routeChannelIdentifier: instagramAccountId,
          channelIdentifier: senderId,
          messageId: event?.message?.mid,
          text,
          rawPayload: event,
        };

        const output = await this.incomingMessageOrchestrator.handle(
          incomingEvent,
        );
        if (!output?.reply) {
          continue;
        }

        const accessToken = this.resolveAccessTokenFromChannelMeta(
          output.channelMeta?.encryptedCredentials,
        );
        if (!accessToken) {
          this.logger.warn(
            `[Instagram] Unable to send outbound message for instagramAccountId=${instagramAccountId}: missing credentials.`,
          );
          continue;
        }

        await this.sendMessage({
          recipientId: senderId,
          text: output.reply.text,
          accessToken,
          messageTimestamp: event.timestamp,
        });
      }
    }
  }

  private resolveAccessTokenFromChannelMeta(
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
}
