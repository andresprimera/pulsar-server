import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import {
  WhatsAppServerConfig,
  buildMessagesUrl,
  loadWhatsAppConfig,
} from './whatsapp.config';
import { CHANNEL_TYPES } from '@channels/shared/channel-type.constants';
import { IncomingMessageOrchestrator } from '@agent/incoming-message.orchestrator';
import { IncomingChannelEvent } from '@channels/shared/incoming-channel-event.interface';
import { decryptRecord } from '@database/utils/crypto.util';
import { ClientAgentRepository } from '@database/repositories/client-agent.repository';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly config: WhatsAppServerConfig;

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
    private readonly clientAgentRepository: ClientAgentRepository,
  ) {
    this.config = loadWhatsAppConfig();
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
  }

  async handleIncoming(payload: any): Promise<void> {
    // TODO: deduplicate message.id to avoid double-processing

    if (!payload.entry?.[0]?.changes?.[0]?.value?.messages) {
      return;
    }

    const value = payload.entry[0].changes[0].value;
    const message = value.messages[0];

    if (message.type !== 'text') {
      return;
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    const senderId = message.from;
    const messageId = message.id;
    const text = message.text?.body;

    if (!phoneNumberId || !senderId || !messageId || !text) {
      this.logger.warn(
        '[WhatsApp] Invalid text payload. Missing required fields.',
      );
      return;
    }

    this.logger.log(
      `[WhatsApp] Incoming message phoneNumberId=${phoneNumberId}`,
    );

    const event: IncomingChannelEvent = {
      channelId: CHANNEL_TYPES.WHATSAPP,
      routeChannelIdentifier: phoneNumberId,
      channelIdentifier: senderId,
      messageId,
      text,
      rawPayload: payload,
    };

    const output = await this.incomingMessageOrchestrator.handle(event);
    if (!output?.reply) {
      return;
    }

    const credentials = await this.resolveOutboundCredentials(event);
    if (!credentials) {
      this.logger.warn(
        `[WhatsApp] Unable to send outbound message for phoneNumberId=${phoneNumberId}: missing credentials.`,
      );
      return;
    }

    this.logger.log(
      `[WhatsApp] Sending to ${event.channelIdentifier}: ${output.reply.text}`,
    );

    try {
      await this.sendMessage(
        event.channelIdentifier,
        output.reply.text,
        credentials,
      );
    } catch (error) {
      this.logger.error(
        `[WhatsApp] Failed to send reply: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveOutboundCredentials(
    event: IncomingChannelEvent,
  ): Promise<{ phoneNumberId: string; accessToken: string } | undefined> {
    const clientAgents =
      await this.clientAgentRepository.findActiveByPhoneNumberId(
        event.routeChannelIdentifier,
      );

    const channelConfig = clientAgents
      .flatMap((clientAgent) => clientAgent.channels)
      .find(
        (channel) =>
          channel.status === 'active' &&
          channel.phoneNumberId === event.routeChannelIdentifier,
      );

    if (!channelConfig?.credentials) {
      return undefined;
    }

    const decryptedCredentials = decryptRecord(channelConfig.credentials);
    if (
      !decryptedCredentials.phoneNumberId ||
      !decryptedCredentials.accessToken
    ) {
      return undefined;
    }

    return {
      phoneNumberId: decryptedCredentials.phoneNumberId,
      accessToken: decryptedCredentials.accessToken,
    };
  }

  private async sendMessage(
    to: string,
    text: string,
    channelCredentials: { phoneNumberId: string; accessToken: string },
  ): Promise<void> {
    const url = buildMessagesUrl(this.config, channelCredentials.phoneNumberId);

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    });

    this.logger.log(`[WhatsApp] Sending message to ${url} | payload: ${body}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelCredentials.accessToken}`,
        },
        body,
      });
    } catch (error) {
      const cause = error instanceof Error ? (error as any).cause : undefined;
      this.logger.error(
        `[WhatsApp] fetch failed for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }` +
          (cause
            ? ` | cause: ${
                cause instanceof Error ? cause.message : String(cause)
              }`
            : ''),
      );
      throw error;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `[WhatsApp] Failed to send message to ${url}: ${response.status} ${errorBody}`,
      );
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    this.logger.log(`[WhatsApp] Message sent successfully to ${to}`);
  }
}
