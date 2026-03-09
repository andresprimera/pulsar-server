import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentService } from '@agent/agent.service';
import { AgentOutput } from '@agent/contracts/agent-output';
import { AgentInput } from '@agent/contracts/agent-input';
import { AgentContextService } from '@agent/agent-context.service';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { ChannelType } from '@domain/channels/channel-type.type';
import { IncomingChannelEvent } from '@domain/channels/incoming-channel-event.interface';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { AgentRoutingService } from '@domain/routing/agent-routing.service';
import { ConversationService } from '@domain/conversation/conversation.service';
import { EventIdempotencyService } from '@persistence/event-idempotency.service';

@Injectable()
export class IncomingMessageOrchestrator {
  private readonly logger = new Logger(IncomingMessageOrchestrator.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly agentRoutingService: AgentRoutingService,
    private readonly agentContextService: AgentContextService,
    private readonly contactIdentityResolver: ContactIdentityResolver,
    private readonly conversationService: ConversationService,
    private readonly eventIdempotencyService: EventIdempotencyService,
    private readonly quotaEnforcementService: QuotaEnforcementService,
  ) {}

  async handle(event: IncomingChannelEvent): Promise<AgentOutput | undefined> {
    const logPrefix = this.getLogPrefix(event.channelId);

    const isFirst = await this.eventIdempotencyService.registerIfFirst({
      channel: event.channelId,
      messageId: event.messageId,
    });

    if (!isFirst) {
      this.logger.log(
        `[${logPrefix}] Duplicate event detected for channel=${event.channelId} messageId=${event.messageId}`,
      );
      return {};
    }

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
      const prompt = await this.agentContextService.buildAmbiguousPrompt(
        routeDecision.candidates,
      );
      const fallbackConfig = fallback?.channelConfig;
      const routeChannelIdentifier =
        fallbackConfig?.phoneNumberId ??
        fallbackConfig?.instagramAccountId ??
        fallbackConfig?.tiktokUserId ??
        event.routeChannelIdentifier;
      return {
        reply: {
          type: 'text',
          text: prompt,
        },
        channelMeta: {
          encryptedCredentials: fallbackConfig?.credentials ?? undefined,
          provider: fallbackConfig?.provider,
          routeChannelIdentifier,
        },
      };
    }

    const { clientAgent, channelConfig } = routeDecision.candidate;

    const rawContext = await this.agentContextService.buildContextFromRoute(
      clientAgent,
      channelConfig,
    );
    if (!rawContext) {
      this.logger.warn(
        `[${logPrefix}] Agent ${clientAgent.agentId} is not active. Skipping message.`,
      );
      return undefined;
    }

    const clientBillingAnchor =
      await this.agentContextService.getClientBillingAnchor(
        clientAgent.clientId,
      );
    if (!clientBillingAnchor) {
      this.logger.warn(
        `[${logPrefix}] Client ${clientAgent.clientId} has no billing anchor. Skipping message.`,
      );
      return undefined;
    }
    const quotaResult = await this.quotaEnforcementService.check({
      clientId: clientAgent.clientId,
      agentId: clientAgent.agentId,
      channelId: channelConfig.channelId,
      clientBillingAnchor,
      agentMonthlyTokenQuota:
        clientAgent.agentPricing?.monthlyTokenQuota ?? null,
      channelMonthlyMessageQuota: channelConfig.monthlyMessageQuota ?? null,
    });
    if (!quotaResult.allowed) {
      this.logger.warn(
        `[${logPrefix}] Quota exceeded for routeChannelIdentifier=${event.routeChannelIdentifier}: ${quotaResult.reason}. Message dropped.`,
      );
      return undefined;
    }

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

    const routeChannelIdentifier =
      channelConfig.phoneNumberId ??
      channelConfig.instagramAccountId ??
      channelConfig.tiktokUserId ??
      event.routeChannelIdentifier;
    return {
      ...output,
      channelMeta: {
        encryptedCredentials: channelConfig.credentials ?? undefined,
        provider: channelConfig.provider,
        routeChannelIdentifier,
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
}
