import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentContext } from './contracts/agent-context';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import {
  ClientAgent,
  HireChannelConfig,
} from '@persistence/schemas/client-agent.schema';
import { decrypt, decryptRecord } from '@shared/crypto.util';
import { RouteCandidate } from '@domain/routing/agent-routing.service';

@Injectable()
export class AgentContextService {
  private readonly logger = new Logger(AgentContextService.name);

  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly clientRepository: ClientRepository,
    private readonly personalityRepository: PersonalityRepository,
  ) {}

  /**
   * Builds full AgentContext from route candidate, loading agent and decrypting
   * credentials in the agent layer. Returns null if agent is not active.
   */
  async buildContextFromRoute(
    clientAgent: ClientAgent,
    channelConfig: HireChannelConfig,
  ): Promise<AgentContext | null> {
    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      return null;
    }

    const rawApiKey =
      channelConfig.llmConfig.apiKey &&
      !String(channelConfig.llmConfig.apiKey).includes('REPLACE_ME')
        ? channelConfig.llmConfig.apiKey
        : process.env.OPENAI_API_KEY ?? '';
    const apiKey = decrypt(rawApiKey);

    const channelConfigDecrypted =
      channelConfig.credentials &&
      typeof channelConfig.credentials === 'object' &&
      Object.keys(channelConfig.credentials).length > 0
        ? decryptRecord(channelConfig.credentials)
        : {};

    let personality: AgentContext['personality'] | undefined;
    const personalityId = clientAgent.personalityId;
    if (personalityId) {
      const personalityIdStr =
        typeof personalityId === 'string'
          ? personalityId
          : (personalityId as Types.ObjectId).toString();
      const personalityDoc = await this.personalityRepository.findActiveById(
        personalityIdStr,
      );
      if (personalityDoc) {
        personality = {
          id: (personalityDoc._id as Types.ObjectId).toString(),
          name: personalityDoc.name,
          promptTemplate: personalityDoc.promptTemplate,
        };
      }
    }

    const rawContext: AgentContext = {
      agentId: clientAgent.agentId,
      agentName: agent.name,
      clientId: clientAgent.clientId,
      channelId: channelConfig.channelId.toString(),
      systemPrompt: agent.systemPrompt,
      personality,
      llmConfig: {
        provider: (channelConfig.llmConfig.provider || 'openai') as any,
        apiKey,
        model: channelConfig.llmConfig.model || 'gpt-4o',
      },
      channelConfig: channelConfigDecrypted,
    };

    return rawContext;
  }

  /**
   * Builds the ambiguous-routing clarification prompt using client name from persistence.
   */
  async buildAmbiguousPrompt(candidates: RouteCandidate[]): Promise<string> {
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

  /**
   * Returns the client's billing anchor (cycle start reference). Used by the
   * orchestrator for quota period calculation. All billing cycles are derived
   * from this date.
   */
  async getClientBillingAnchor(clientId: string): Promise<Date | null> {
    const client = await this.clientRepository.findById(clientId);
    return client?.billingAnchor ?? null;
  }

  /**
   * Enriches context with clientName and agentName for PromptBuilder.
   * Does not build or mutate systemPrompt; that is done by PromptBuilder.
   */
  async enrichContext(context: AgentContext): Promise<AgentContext> {
    const client = await this.clientRepository.findById(context.clientId);

    if (!client) {
      this.logger.warn(
        `Client ${context.clientId} not found. Context will have no client name.`,
      );
      return context;
    }

    return {
      ...context,
      clientName: client.name,
      ...(client.brandVoice != null && client.brandVoice !== ''
        ? { brandVoice: client.brandVoice }
        : {}),
    };
  }
}
