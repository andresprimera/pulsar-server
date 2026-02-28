import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { generateText } from 'ai';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { MessageRepository } from '../../database/repositories/message.repository';
import { ContactRepository } from '../../database/repositories/contact.repository';
import { ClientAgent, HireChannelConfig } from '../../database/schemas/client-agent.schema';
import { createLLMModel } from '../../agent/llm/llm.factory';
import { LlmProvider } from '../../agent/llm/provider.enum';
import { ChannelType } from './channel-type.type';
import { CHANNEL_TYPES } from './channel-type.constants';

export interface RouteCandidate {
  clientAgent: ClientAgent;
  channelConfig: HireChannelConfig;
  agentName: string;
}

export type AgentRouteDecision =
  | {
      kind: 'resolved';
      candidate: RouteCandidate;
    }
  | {
      kind: 'ambiguous';
      candidates: RouteCandidate[];
      prompt: string;
    }
  | {
      kind: 'unroutable';
      reason: 'missing-identifier' | 'no-candidates';
    };

/**
 * Channel-specific routing context
 */
export interface ChannelRoutingContext {
  /** Routing account identifier (phoneNumberId, tiktokUserId, instagramAccountId, etc.) */
  routeChannelIdentifier: string;
  /** Contact identity identifier within the channel (phone, sender user ID, etc.) */
  channelIdentifier: string;
  /** Incoming message text */
  incomingText: string;
  /** Channel type for logging */
  channelType: ChannelType;
}

@Injectable()
export class AgentRoutingService {
  private readonly logger = new Logger(AgentRoutingService.name);
  private readonly enableSemanticRouting: boolean;

  constructor(
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly contactRepository: ContactRepository,
    private readonly messageRepository: MessageRepository,
    private readonly agentRepository: AgentRepository,
  ) {
    this.enableSemanticRouting =
      process.env.ENABLE_SEMANTIC_ROUTING === 'true';
  }

  /**
   * Resolve which agent should handle an incoming message.
   * Works for any channel type (WhatsApp, Email, TikTok).
   */
  async resolveRoute(
    context: ChannelRoutingContext,
  ): Promise<AgentRouteDecision> {
    if (!context.routeChannelIdentifier) {
      return { kind: 'unroutable', reason: 'missing-identifier' };
    }

    const clientAgents = await this.findCandidatesByChannel(
      context.channelType,
      context.routeChannelIdentifier,
    );

    const candidates = await this.buildCandidates(
      clientAgents,
      context.routeChannelIdentifier,
      context.channelType,
    );

    if (candidates.length === 0) {
      return { kind: 'unroutable', reason: 'no-candidates' };
    }

    if (candidates.length === 1) {
      return { kind: 'resolved', candidate: candidates[0] };
    }

    const explicit = this.resolveExplicitSelection(candidates, context.incomingText);
    if (explicit) {
      return { kind: 'resolved', candidate: explicit };
    }

    const sticky = await this.resolveFromRecentHistory(
      candidates,
      context.channelIdentifier,
    );
    if (sticky) {
      return { kind: 'resolved', candidate: sticky };
    }

    const keywordBased = this.resolveFromKeywordScore(candidates, context.incomingText);
    if (keywordBased) {
      return { kind: 'resolved', candidate: keywordBased };
    }

    // Strategy D: LLM semantic routing (if enabled)
    if (this.enableSemanticRouting) {
      const semantic = await this.resolveFromSemanticAnalysis(
        candidates,
        context.incomingText,
      );
      if (semantic) {
        return { kind: 'resolved', candidate: semantic };
      }
    }

    const sortedCandidates = [...candidates].sort((a, b) =>
      a.agentName.localeCompare(b.agentName),
    );

    return {
      kind: 'ambiguous',
      candidates: sortedCandidates,
      prompt: this.buildAmbiguousPrompt(sortedCandidates),
    };
  }

  /**
   * Find candidate ClientAgents based on channel type.
   */
  private async findCandidatesByChannel(
    channelType: ChannelType,
    identifier: string,
  ): Promise<ClientAgent[]> {
    switch (channelType) {
      case CHANNEL_TYPES.WHATSAPP:
        return this.clientAgentRepository.findActiveByPhoneNumberId(identifier);
      case CHANNEL_TYPES.TIKTOK:
        return this.clientAgentRepository.findActiveByTiktokUserId(identifier);
      case CHANNEL_TYPES.INSTAGRAM:
        return this.clientAgentRepository.findActiveByInstagramAccountId(identifier);
      default:
        return [];
    }
  }

  /**
   * Build routing candidates by matching channel configs.
   */
  private async buildCandidates(
    clientAgents: ClientAgent[],
    identifier: string,
    channelType: ChannelType,
  ): Promise<RouteCandidate[]> {
    const unresolved = clientAgents
      .map((clientAgent) => {
        const channelConfig = clientAgent.channels.find((channel) => {
          if (channel.status !== 'active') return false;
          
          switch (channelType) {
            case CHANNEL_TYPES.WHATSAPP:
              return channel.phoneNumberId === identifier;
            case CHANNEL_TYPES.TIKTOK:
              return channel.tiktokUserId === identifier;
            case CHANNEL_TYPES.INSTAGRAM:
              return channel.instagramAccountId === identifier;
            default:
              return false;
          }
        });

        if (!channelConfig) {
          return null;
        }

        return { clientAgent, channelConfig };
      })
      .filter((candidate): candidate is { clientAgent: ClientAgent; channelConfig: HireChannelConfig } =>
        Boolean(candidate),
      );

    const candidates = await Promise.all(
      unresolved.map(async ({ clientAgent, channelConfig }) => {
        const agent = await this.agentRepository.findById(clientAgent.agentId);
        if (!agent || agent.status !== 'active') {
          return null;
        }

        return {
          clientAgent,
          channelConfig,
          agentName: agent.name,
        };
      }),
    );

    return candidates.filter((candidate): candidate is RouteCandidate => Boolean(candidate));
  }

  private resolveExplicitSelection(
    candidates: RouteCandidate[],
    incomingText: string,
  ): RouteCandidate | null {
    const text = incomingText.trim().toLowerCase();
    const sorted = [...candidates].sort((a, b) =>
      a.agentName.localeCompare(b.agentName),
    );

    if (/^\d+$/.test(text)) {
      const selectedIndex = Number(text) - 1;
      if (selectedIndex >= 0 && selectedIndex < sorted.length) {
        return sorted[selectedIndex];
      }
    }

    const exactNameMatches = sorted.filter(
      (candidate) => candidate.agentName.trim().toLowerCase() === text,
    );

    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }

    const containedNameMatches = sorted.filter((candidate) =>
      text.includes(candidate.agentName.trim().toLowerCase()),
    );

    if (containedNameMatches.length === 1) {
      return containedNameMatches[0];
    }

    return null;
  }

  private async resolveFromRecentHistory(
    candidates: RouteCandidate[],
    channelIdentifier: string,
  ): Promise<RouteCandidate | null> {
    const byClient = new Map<string, RouteCandidate[]>();

    for (const candidate of candidates) {
      const key = candidate.clientAgent.clientId;
      const list = byClient.get(key) ?? [];
      list.push(candidate);
      byClient.set(key, list);
    }

    let mostRecent: { createdAt: Date; candidate: RouteCandidate } | null = null;

    for (const [clientId, clientCandidates] of byClient) {
      if (!Types.ObjectId.isValid(clientId)) {
        continue;
      }

      const agentIds = clientCandidates
        .map((candidate) => candidate.clientAgent.agentId)
        .filter((agentId) => Types.ObjectId.isValid(agentId))
        .map((agentId) => new Types.ObjectId(agentId));

      const channelIds = clientCandidates
        .map((candidate) => candidate.channelConfig.channelId)
        .map((channelId) => channelId.toString())
        .filter((channelId) => Types.ObjectId.isValid(channelId))
        .map((channelId) => new Types.ObjectId(channelId));

      if (agentIds.length === 0) {
        continue;
      }

      for (const candidate of clientCandidates) {
        const channelId = candidate.channelConfig.channelId.toString();
        if (!Types.ObjectId.isValid(channelId)) {
          continue;
        }

        const contact = await this.contactRepository.findByExternalIdentity(
          new Types.ObjectId(clientId),
          new Types.ObjectId(channelId),
          channelIdentifier,
        );

        if (!contact) {
          continue;
        }

        const latestMessage =
          await this.messageRepository.findLatestByContactAndAgents(
            contact._id as Types.ObjectId,
            agentIds,
            channelIds,
          );

        if (!latestMessage) {
          continue;
        }

        const matched = clientCandidates.find(
          (candidate) =>
            candidate.clientAgent.agentId.toString() ===
            latestMessage.agentId.toString(),
        );

        if (!matched) {
          continue;
        }

        if (!mostRecent || latestMessage.createdAt > mostRecent.createdAt) {
          mostRecent = { createdAt: latestMessage.createdAt, candidate: matched };
        }
      }
    }

    return mostRecent?.candidate ?? null;
  }

  private resolveFromKeywordScore(
    candidates: RouteCandidate[],
    incomingText: string,
  ): RouteCandidate | null {
    const text = incomingText.toLowerCase();
    const scored = candidates.map((candidate) => {
      const tokens = candidate.agentName
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length >= 4);

      const score = tokens.reduce((total, token) => {
        if (!text.includes(token)) {
          return total;
        }

        return total + 1;
      }, 0);

      return { candidate, score };
    });

    const maxScore = Math.max(...scored.map((item) => item.score));
    if (maxScore <= 0) {
      return null;
    }

    const winners = scored.filter((item) => item.score === maxScore);
    if (winners.length !== 1) {
      return null;
    }

    return winners[0].candidate;
  }

  private async resolveFromSemanticAnalysis(
    candidates: RouteCandidate[],
    incomingText: string,
  ): Promise<RouteCandidate | null> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        this.logger.warn(
          '[AgentRouter] OPENAI_API_KEY missing, skipping semantic routing',
        );
        return null;
      }

      const model = createLLMModel({
        provider: LlmProvider.OpenAI,
        model: 'gpt-4o-mini',
        apiKey,
      });

      const agentDescriptions = candidates
        .map(
          (candidate, index) =>
            `${index + 1}. ${candidate.agentName} (Handle queries about: ${this.inferAgentPurpose(candidate.agentName)})`,
        )
        .join('\n');

      const systemPrompt = `You are a routing assistant. Given a user message and a list of available agents, determine which agent is best suited to handle the message.

Available agents:
${agentDescriptions}

Respond with ONLY the number of the most appropriate agent (1, 2, etc.). If no agent is clearly appropriate, respond with "uncertain".`;

      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: `User message: "${incomingText}"\n\nWhich agent should handle this?`,
      });

      const trimmed = text.trim();
      if (/^\d+$/.test(trimmed)) {
        const selectedIndex = Number(trimmed) - 1;
        if (selectedIndex >= 0 && selectedIndex < candidates.length) {
          this.logger.log(
            `[AgentRouter] Semantic routing selected agent ${selectedIndex + 1}`,
          );
          return candidates[selectedIndex];
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `[AgentRouter] Semantic routing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private inferAgentPurpose(agentName: string): string {
    const lower = agentName.toLowerCase();
    if (lower.includes('customer') || lower.includes('support')) {
      return 'support, complaints, order issues, general help';
    }
    if (lower.includes('sales') || lower.includes('lead')) {
      return 'product information, pricing, purchases, quotes';
    }
    if (lower.includes('technical') || lower.includes('engineering')) {
      return 'technical issues, bugs, integrations';
    }
    if (lower.includes('billing') || lower.includes('account')) {
      return 'billing, payments, invoices, account management';
    }
    return 'general inquiries';
  }

  private buildAmbiguousPrompt(candidates: RouteCandidate[]): string {
    const lines = candidates.map(
      (candidate, index) => `${index + 1}) ${candidate.agentName}`,
    );

    return [
      'I can route your message to the right specialist.',
      'Please reply with the number or name of the agent:',
      ...lines,
    ].join('\n');
  }
}
