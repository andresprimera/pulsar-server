import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientRepository } from '../../database/repositories/client.repository';
import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
import { RouteCandidate } from '../shared/agent-routing.service';
import {
  WhatsAppServerConfig,
  loadWhatsAppConfig,
  buildMessagesUrl,
} from './whatsapp.config';
import { AgentRoutingService } from '../shared/agent-routing.service';
import { AgentContextService } from '../../agent/agent-context.service';
import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
import { CHANNEL_TYPES } from '../shared/channel-type.constants';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly config: WhatsAppServerConfig;

  constructor(
    private readonly agentService: AgentService,
    private readonly agentRepository: AgentRepository,
    private readonly clientRepository: ClientRepository,
    private readonly agentRoutingService: AgentRoutingService,
    private readonly agentContextService: AgentContextService,
    private readonly contactIdentityResolver: ContactIdentityResolver,
  ) {
    this.config = loadWhatsAppConfig();
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
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

    const routeDecision = await this.agentRoutingService.resolveRoute({
      routeChannelIdentifier: phoneNumberId,
      channelIdentifier: message.from,
      incomingText: message.text.body,
      channelType: CHANNEL_TYPES.WHATSAPP,
    });

    if (routeDecision.kind === 'unroutable') {
      this.logger.warn(
        `[WhatsApp] No active ClientAgent found for phoneNumberId=${phoneNumberId}.`,
      );
      return;
    }

    if (routeDecision.kind === 'ambiguous') {
      const fallback = routeDecision.candidates[0];
      if (!fallback?.channelConfig?.credentials) {
        this.logger.warn(
          `[WhatsApp] Unable to send routing clarification for phoneNumberId=${phoneNumberId}: missing credentials.`,
        );
        return;
      }

      const prompt = await this.buildAmbiguousPrompt(routeDecision.candidates);
      const decryptedCredentials = decryptRecord(fallback.channelConfig.credentials);
      await this.sendMessage(message.from, prompt, {
        phoneNumberId: decryptedCredentials.phoneNumberId,
        accessToken: decryptedCredentials.accessToken,
      });
      return;
    }

    const { clientAgent, channelConfig } = routeDecision.candidate;

    // Guard: credentials may be undefined if select('+channels.credentials') was missed
    if (!channelConfig.credentials) {
      this.logger.error(
        `[WhatsApp] Credentials missing for phoneNumberId=${phoneNumberId}. Possible select('+channels.credentials') omission.`,
      );
      return;
    }

    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      this.logger.warn(
        `[WhatsApp] Agent ${clientAgent.agentId} is not active. Skipping message.`,
      );
      return;
    }

    const rawContext: AgentContext = {
      agentId: clientAgent.agentId,
      agentName: agent.name,
      clientId: clientAgent.clientId,
      channelId: channelConfig.channelId.toString(),
      systemPrompt: agent.systemPrompt,
      llmConfig: {
        ...channelConfig.llmConfig,
        // TODO: [HACK] REMOVE THIS IN PRODUCTION.
        // Forcing 'openai' provider and system key for dev/testing ease.
        // This bypasses client billing!
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
      channelType: CHANNEL_TYPES.WHATSAPP,
      payload,
      clientId: new Types.ObjectId(clientAgent.clientId),
      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
      contactName: message.from,
    });

    const input: AgentInput = {
      channel: CHANNEL_TYPES.WHATSAPP,
      contactId: contact._id.toString(),
      conversationId: `${phoneNumberId}:${message.from}`,
      message: {
        type: 'text',
        text: message.text.body,
      },
      metadata: {
        messageId: message.id,
        phoneNumberId,
      },
    };

    const output = await this.agentService.run(input, context);

    if (output.reply) {
      this.logger.log(
        `[WhatsApp] Sending to ${message.from}: ${output.reply.text}`,
      );

      const decryptedCredentials = decryptRecord(channelConfig.credentials);
      await this.sendMessage(message.from, output.reply.text, {
        phoneNumberId: decryptedCredentials.phoneNumberId,
        accessToken: decryptedCredentials.accessToken,
      });
    }
  }

  private async buildAmbiguousPrompt(
    candidates: RouteCandidate[],
  ): Promise<string> {
    const clientId = candidates[0].clientAgent.clientId;
    const client = await this.clientRepository.findById(clientId);
    const clientName = client?.name;

    const lines = candidates.map(
      (candidate, index) => `${index + 1}. ${candidate.agentName}`,
    );

    const greeting = clientName
      ? `Hey there! Thanks for reaching out to *${clientName}*.`
      : `Hey there! Thanks for reaching out.`;

    return [
      greeting,
      '',
      'We have a few specialists ready to help you:',
      ...lines,
      '',
      'Just reply with a number or name to get started!',
    ].join('\n');
  }
}
