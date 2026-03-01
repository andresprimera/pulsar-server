import { Injectable, Logger } from '@nestjs/common';
import { decryptRecord } from '../../database/utils/crypto.util';
import { TIKTOK_API_BASE_URL } from './tiktok.config';
import { CHANNEL_TYPES } from '../shared/channel-type.constants';
import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
import { IncomingChannelEvent } from '../shared/incoming-channel-event.interface';
import { AgentRoutingService } from '../shared/agent-routing.service';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
    private readonly agentRoutingService: AgentRoutingService,
  ) {}

  async handleIncoming(payload: any): Promise<void> {
    this.logger.log(
      `[TikTok] Incoming payload: ${JSON.stringify(payload)}`,
    );

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

    this.logger.log(
      `[TikTok] Incoming message from sender=${data.sender?.user_id} to recipient=${recipientUserId}`,
    );

    const incomingEvent: IncomingChannelEvent = {
      channelId: CHANNEL_TYPES.TIKTOK,
      routeChannelIdentifier: recipientUserId,
      channelIdentifier: senderUserId,
      messageId: data.message_id,
      text: data.message.text,
      rawPayload: payload,
    };

    const output = await this.incomingMessageOrchestrator.handle(incomingEvent);
    if (!output?.reply) {
      return;
    }

    const accessToken = await this.resolveAccessToken(incomingEvent);
    if (!accessToken) {
      this.logger.warn(
        `[TikTok] Unable to send outbound message for tiktokUserId=${recipientUserId}: missing credentials.`,
      );
      return;
    }

    this.logger.log(
      `[TikTok] Sending reply to sender=${data.sender.user_id}`,
    );

    try {
      await this.sendMessage({
        recipientId: data.sender.user_id,
        conversationId: data.conversation_id,
        text: output.reply.text,
        accessToken,
      });
      this.logger.log(`[TikTok] Reply sent successfully.`);
    } catch (error) {
      this.logger.error(`[TikTok] Failed to send reply: ${error.message}`);
    }
  }

  private async resolveAccessToken(
    event: IncomingChannelEvent,
  ): Promise<string | undefined> {
    const routeDecision = await this.agentRoutingService.resolveRoute({
      routeChannelIdentifier: event.routeChannelIdentifier,
      channelIdentifier: event.channelIdentifier,
      incomingText: event.text,
      channelType: CHANNEL_TYPES.TIKTOK,
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
    return decryptedCredentials.accessToken;
  }

  private async sendMessage(params: {
    recipientId: string;
    conversationId: string;
    text: string;
    accessToken: string;
  }): Promise<void> {
    const { recipientId, conversationId, text, accessToken } = params;

    const url = `${TIKTOK_API_BASE_URL}/message/send/`;

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
