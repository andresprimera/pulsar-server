import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Types } from 'mongoose';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
import {
  InstagramServerConfig,
  loadInstagramConfig,
  buildMessagesUrl,
} from './instagram.config';
import { AgentRoutingService } from '../shared/agent-routing.service';
import { AgentContextService } from '../../agent/agent-context.service';
import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
import { CHANNEL_TYPES } from '../shared/channel-type.constants';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly config: InstagramServerConfig;
  private readonly responseWindowMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly agentService: AgentService,
    private readonly agentRepository: AgentRepository,
    private readonly agentRoutingService: AgentRoutingService,
    private readonly agentContextService: AgentContextService,
    private readonly contactIdentityResolver: ContactIdentityResolver,
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

    const provided = Buffer.from(providedDigest, 'utf8') as unknown as Uint8Array;
    const expected = Buffer.from(expectedDigest, 'utf8') as unknown as Uint8Array;

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

        const routeDecision = await this.agentRoutingService.resolveRoute({
          routeChannelIdentifier: instagramAccountId,
          channelIdentifier: senderId,
          incomingText: text,
          channelType: CHANNEL_TYPES.INSTAGRAM,
        });

        if (routeDecision.kind === 'unroutable') {
          this.logger.warn(
            `[Instagram] No active ClientAgent found for instagramAccountId=${instagramAccountId}.`,
          );
          continue;
        }

        if (routeDecision.kind === 'ambiguous') {
          const fallback = routeDecision.candidates[0];
          if (!fallback?.channelConfig?.credentials) {
            this.logger.warn(
              `[Instagram] Unable to send routing clarification for instagramAccountId=${instagramAccountId}: missing credentials.`,
            );
            continue;
          }

          const decryptedCredentials = decryptRecord(fallback.channelConfig.credentials);
          await this.sendMessage({
            recipientId: senderId,
            text: routeDecision.prompt,
            accessToken: decryptedCredentials.accessToken,
            messageTimestamp: event.timestamp,
          });
          continue;
        }

        const { clientAgent, channelConfig } = routeDecision.candidate;

        if (!channelConfig.credentials) {
          this.logger.error(
            `[Instagram] Credentials missing for instagramAccountId=${instagramAccountId}. Possible select('+channels.credentials') omission.`,
          );
          continue;
        }

        const agent = await this.agentRepository.findActiveById(clientAgent.agentId);
        if (!agent) {
          this.logger.warn(
            `[Instagram] Agent ${clientAgent.agentId} is not active. Skipping message.`,
          );
          continue;
        }

        const rawContext: AgentContext = {
          agentId: clientAgent.agentId,
          agentName: agent.name,
          clientId: clientAgent.clientId,
          channelId: channelConfig.channelId.toString(),
          systemPrompt: agent.systemPrompt,
          llmConfig: {
            ...channelConfig.llmConfig,
            provider: (channelConfig.llmConfig.provider || 'openai') as any,
            apiKey: decrypt(
              channelConfig.llmConfig.apiKey &&
                !channelConfig.llmConfig.apiKey.includes('REPLACE_ME')
                ? channelConfig.llmConfig.apiKey
                : process.env.OPENAI_API_KEY ?? '',
            ),
            model: channelConfig.llmConfig.model || 'gpt-4o',
          },
          channelConfig: decryptRecord(channelConfig.credentials),
        };

        const context = await this.agentContextService.enrichContext(rawContext);

        const contact = await this.contactIdentityResolver.resolveContact({
          channelType: CHANNEL_TYPES.INSTAGRAM,
          payload: event,
          clientId: new Types.ObjectId(clientAgent.clientId),
          channelId: new Types.ObjectId(channelConfig.channelId.toString()),
          contactName: senderId,
        });

        const input: AgentInput = {
          channel: CHANNEL_TYPES.INSTAGRAM,
          contactId: contact._id.toString(),
          message: {
            type: 'text',
            text,
          },
          contactMetadata: contact.metadata,
          contactSummary: contact.contactSummary,
          metadata: {
            messageId: event?.message?.mid,
            instagramAccountId,
          },
        };

        const output = await this.agentService.run(input, context);

        if (output.reply) {
          const decryptedCredentials = decryptRecord(channelConfig.credentials);
          await this.sendMessage({
            recipientId: senderId,
            text: output.reply.text,
            accessToken: decryptedCredentials.accessToken,
            messageTimestamp: event.timestamp,
          });
        }
      }
    }
  }
}
