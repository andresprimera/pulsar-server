import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentContext } from './contracts/agent-context';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { Client } from '@persistence/schemas/client.schema';
import {
  ClientAgent,
  HireChannelConfig,
} from '@persistence/schemas/client-agent.schema';
import { decrypt, decryptRecord } from '@shared/crypto.util';
import { RouteCandidate } from '@domain/routing/agent-routing.service';
import { LlmProvider } from '@domain/llm/provider.enum';

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
   * credentials in the agent layer. Returns { context, client } so the orchestrator
   * can pass the client to enrichContext and avoid a second client load.
   * Returns context: null if agent is not active.
   */
  async buildContextFromRoute(
    clientAgent: ClientAgent,
    channelConfig: HireChannelConfig,
  ): Promise<{ context: AgentContext | null; client: Client | null }> {
    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      return { context: null, client: null };
    }

    const client = await this.clientRepository.findByIdWithLlmCredentials(
      clientAgent.clientId,
    );

    const useClientLlm =
      client?.llmConfig?.apiKey != null &&
      String(client.llmConfig.apiKey) !== '' &&
      !String(client.llmConfig.apiKey).includes('REPLACE_ME');

    const rawApiKey = useClientLlm
      ? client!.llmConfig!.apiKey
      : process.env.OPENAI_API_KEY ?? '';
    const apiKey = decrypt(rawApiKey);

    const provider: LlmProvider = useClientLlm
      ? (client!.llmConfig!.provider as LlmProvider)
      : (client?.llmPreferences?.provider as LlmProvider) ?? LlmProvider.OpenAI;
    const model = useClientLlm
      ? client!.llmConfig!.model
      : client?.llmPreferences?.defaultModel ?? 'gpt-4o';

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
          examplePhrases: personalityDoc.examplePhrases ?? [],
          guardrails: personalityDoc.guardrails,
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
        provider,
        apiKey,
        model,
      },
      channelConfig: channelConfigDecrypted,
    };

    return { context: rawContext, client };
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
   * Enriches context with clientName and brandVoice for PromptBuilder.
   * When client is provided (e.g. from buildContextFromRoute), skips a second client load.
   */
  async enrichContext(
    context: AgentContext,
    client?: Client | null,
  ): Promise<AgentContext> {
    const resolvedClient =
      client ?? (await this.clientRepository.findById(context.clientId));

    if (!resolvedClient) {
      this.logger.warn(
        `Client ${context.clientId} not found. Context will have no client name.`,
      );
      return context;
    }

    return {
      ...context,
      clientName: resolvedClient.name,
      ...(resolvedClient.brandVoice != null &&
      resolvedClient.brandVoice !== ''
        ? { brandVoice: resolvedClient.brandVoice }
        : {}),
    };
  }
}
