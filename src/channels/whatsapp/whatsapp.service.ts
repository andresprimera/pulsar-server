import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import {
  WhatsAppServerConfig,
  buildMessagesUrl,
  loadWhatsAppConfig,
} from './whatsapp.config';
import { CHANNEL_TYPES } from '../shared/channel-type.constants';
import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
import { IncomingChannelEvent } from '../shared/incoming-channel-event.interface';
import { AgentRoutingService } from '../shared/agent-routing.service';
import { decryptRecord } from '../../database/utils/crypto.util';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly config: WhatsAppServerConfig;

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
    private readonly agentRoutingService: AgentRoutingService,
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

    this.logger.log(
      `[WhatsApp] Incoming message metdata: ${JSON.stringify(value.metadata)}`,
    );
    this.logger.log(`[WhatsApp] Extracted phoneNumberId: ${phoneNumberId}`);

    const event: IncomingChannelEvent = {
      channelId: CHANNEL_TYPES.WHATSAPP,
      routeChannelIdentifier: phoneNumberId,
      channelIdentifier: message.from,
      messageId: message.id,
      text: message.text.body,
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
    await this.sendMessage(event.channelIdentifier, output.reply.text, credentials);
  }

  private async resolveOutboundCredentials(
    event: IncomingChannelEvent,
  ): Promise<{ phoneNumberId: string; accessToken: string } | undefined> {
    const routeDecision = await this.agentRoutingService.resolveRoute({
      routeChannelIdentifier: event.routeChannelIdentifier,
      channelIdentifier: event.channelIdentifier,
      incomingText: event.text,
      channelType: CHANNEL_TYPES.WHATSAPP,
    });

    const channelConfig =
      routeDecision.kind === 'resolved'
        ? routeDecision.candidate.channelConfig
        : routeDecision.kind === 'ambiguous'
          ? routeDecision.candidates[0]?.channelConfig
          : undefined;

    if (!channelConfig?.credentials) {
      return undefined;
    }

    const decryptedCredentials = decryptRecord(channelConfig.credentials);
    if (!decryptedCredentials.phoneNumberId || !decryptedCredentials.accessToken) {
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
        `[WhatsApp] fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}` +
          (cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ''),
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
