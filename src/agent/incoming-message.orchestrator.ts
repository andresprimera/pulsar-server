import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentService } from './agent.service';
import { AgentOutput } from './contracts/agent-output';
import { AgentInput } from './contracts/agent-input';
import { AgentContext } from './contracts/agent-context';
import { AgentContextService } from './agent-context.service';
import { AgentRepository } from '@database/repositories/agent.repository';
import { ClientRepository } from '@database/repositories/client.repository';
import { decrypt, decryptRecord } from '@database/utils/crypto.util';
import { CHANNEL_TYPES } from '@channels/shared/channel-type.constants';
import { ContactIdentityResolver } from '@channels/shared/contact-identity.resolver';
import { IncomingChannelEvent } from '@channels/shared/incoming-channel-event.interface';
import {
  AgentRoutingService,
  RouteCandidate,
} from '@channels/shared/agent-routing.service';
import { ConversationService } from '@channels/shared/conversation.service';
import { ChannelType } from '@channels/shared/channel-type.type';

@Injectable()
export class IncomingMessageOrchestrator {
  private readonly logger = new Logger(IncomingMessageOrchestrator.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly agentRepository: AgentRepository,
    private readonly clientRepository: ClientRepository,
    private readonly agentRoutingService: AgentRoutingService,
    private readonly agentContextService: AgentContextService,
    private readonly contactIdentityResolver: ContactIdentityResolver,
    private readonly conversationService: ConversationService,
  ) {}

  async handle(event: IncomingChannelEvent): Promise<AgentOutput | undefined> {
    const logPrefix = this.getLogPrefix(event.channelId);

    const routeDecision = await this.agentRoutingService.resolveRoute({
      routeChannelIdentifier: event.routeChannelIdentifier,
      channelIdentifier: event.channelIdentifier,
      incomingText: event.text,
      channelType: event.channelId as ChannelType,
    });

    if (routeDecision.kind === 'unroutable') {
      this.logger.warn(
        `[${logPrefix}] No active ClientAgent found for routeChannelIdentifier=${event.routeChannelIdentifier}.`,
      );
      return undefined;
    }

    if (routeDecision.kind === 'ambiguous') {
      const fallback = routeDecision.candidates[0];
      if (!fallback?.channelConfig?.credentials) {
        this.logger.warn(
          `[${logPrefix}] Unable to build routing clarification for routeChannelIdentifier=${event.routeChannelIdentifier}: missing credentials.`,
        );
        return undefined;
      }

      const prompt = await this.buildAmbiguousPrompt(routeDecision.candidates);
      return {
        reply: {
          type: 'text',
          text: prompt,
        },
        channelMeta: {
          encryptedCredentials: fallback.channelConfig.credentials,
        },
      };
    }

    const { clientAgent, channelConfig } = routeDecision.candidate;

    // Guard: credentials may be undefined if select('+channels.credentials') was missed
    if (!channelConfig.credentials) {
      this.logger.error(
        `[${logPrefix}] Credentials missing for routeChannelIdentifier=${event.routeChannelIdentifier}. Possible select('+channels.credentials') omission.`,
      );
      return undefined;
    }

    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      this.logger.warn(
        `[${logPrefix}] Agent ${clientAgent.agentId} is not active. Skipping message.`,
      );
      return undefined;
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
      channelType: event.channelId as ChannelType,
      payload: event.rawPayload,
      clientId: new Types.ObjectId(clientAgent.clientId),
      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
      contactName: event.channelIdentifier,
    });

    const conversation = await this.conversationService.resolveOrCreate({
      clientId: new Types.ObjectId(clientAgent.clientId),
      contactId: contact._id,
      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
      now: new Date(),
    });

    const input: AgentInput = {
      channel: event.channelId as ChannelType,
      contactId: contact._id.toString(),
      conversationId: conversation._id.toString(),
      message: {
        type: 'text',
        text: event.text,
      },
      contactMetadata: contact.metadata,
      contactSummary: contact.contactSummary,
      metadata: {
        messageId: event.messageId,
        routeChannelIdentifier: event.routeChannelIdentifier,
      },
    };

    let output: AgentOutput | undefined;
    try {
      output = await this.agentService.run(input, context);
    } finally {
      await this.conversationService.touch(conversation._id as Types.ObjectId);
    }

    if (!output) {
      return output;
    }

    return {
      ...output,
      channelMeta: {
        encryptedCredentials: channelConfig.credentials,
      },
    };
  }

  private getLogPrefix(channelId: string): string {
    switch (channelId) {
      case CHANNEL_TYPES.WHATSAPP:
        return 'WhatsApp';
      case CHANNEL_TYPES.INSTAGRAM:
        return 'Instagram';
      case CHANNEL_TYPES.TIKTOK:
        return 'TikTok';
      default:
        return channelId || 'Channel';
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
