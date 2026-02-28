import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { Types } from 'mongoose';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';
import { AgentContext } from './contracts/agent-context';
import { createLLMModel } from './llm/llm.factory';
import { MessagePersistenceService } from '../channels/shared/message-persistence.service';
import { MetadataExposureService } from './metadata-exposure.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly messagePersistenceService: MessagePersistenceService,
    private readonly metadataExposureService: MetadataExposureService,
  ) {}

  async run(
    input: AgentInput,
    context: AgentContext,
  ): Promise<AgentOutput> {
    this.logger.log(
      `Processing ${context.agentId} for client ${context.clientId} ` +
        `using provider=${context.llmConfig.provider} model=${context.llmConfig.model}`,
    );

    try {
      const persistenceContext = {
        channelId: context.channelId,
        agentId: context.agentId,
        clientId: context.clientId,
        contactId: input.contactId,
      };
      const contactId = new Types.ObjectId(input.contactId);

      await this.messagePersistenceService.createUserMessage(
        input.message.text,
        persistenceContext,
        contactId,
      );

      const conversationHistory =
        await this.messagePersistenceService.getConversationContext(
          persistenceContext,
          contactId,
        );

      const model = createLLMModel(context.llmConfig);

      // Build messages array with conversation history
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        conversationHistory || [];

      // Validate conversation history if provided
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) {
            this.logger.warn(
              `Invalid conversation history message detected: empty or non-string content`,
            );
          }
        }
      }

      // Add current message
      messages.push({
        role: 'user',
        content: input.message.text,
      });

      const safeMetadata = this.metadataExposureService.extractSafeMetadata(
        input.contactMetadata as Record<string, any>,
      );

      const systemPrompt = this.buildSystemPrompt(
        context.systemPrompt,
        safeMetadata,
        input.contactSummary,
      );

      const { text } = await generateText({
        model,
        system: systemPrompt,
        messages,
      });

      const safeText =
        text?.trim() || "I'm having trouble responding right now.";

      this.logger.log(`Response generated for ${context.agentId}`);

      // Automatically handle outgoing message persistence
      await this.messagePersistenceService.handleOutgoingMessage(
        safeText,
        persistenceContext,
        contactId,
        context,
      );

      return {
        reply: {
          type: 'text',
          text: safeText,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error for ${context.agentId} client ${context.clientId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );

      return {
        reply: {
          type: 'text',
          text: "I'm having trouble responding right now.",
        },
      };
    }
  }

  private buildSystemPrompt(
    baseSystemPrompt: string,
    safeMetadata: Record<string, any>,
    contactSummary?: string,
  ): string {
    const contextLines: string[] = [];

    if (contactSummary?.trim()) {
      contextLines.push(`Contact summary: ${contactSummary.trim()}`);
    }

    if (Object.keys(safeMetadata).length > 0) {
      contextLines.push(
        `Safe contact metadata: ${JSON.stringify(safeMetadata)}`,
      );
    }

    if (contextLines.length === 0) {
      return baseSystemPrompt;
    }

    return `${baseSystemPrompt}\n\n${contextLines.join('\n')}`;
  }
}
