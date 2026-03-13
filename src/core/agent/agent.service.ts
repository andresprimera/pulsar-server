import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { Types } from 'mongoose';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';
import { AgentContext } from './contracts/agent-context';
import { createLLMModel } from './llm/llm.factory';
import { MessagePersistenceService } from '@persistence/message-persistence.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { MetadataExposureService } from './metadata-exposure.service';
import { LlmUsageLogRepository } from '@persistence/repositories/llm-usage-log.repository';
import { PromptBuilderService } from './prompt-builder.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly messagePersistenceService: MessagePersistenceService,
    private readonly conversationSummaryService: ConversationSummaryService,
    private readonly metadataExposureService: MetadataExposureService,
    private readonly llmUsageLogRepository: LlmUsageLogRepository,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async run(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
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
      const conversationId = new Types.ObjectId(input.conversationId);

      const conversationHistory =
        await this.messagePersistenceService.getConversationContextByConversationId(
          conversationId,
          new Types.ObjectId(context.agentId),
        );

      await this.messagePersistenceService.createUserMessage(
        input.message.text,
        persistenceContext,
        contactId,
        conversationId,
      );

      const model = createLLMModel(context.llmConfig);

      // Build messages array with conversation history
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        conversationHistory || [];

      // Validate conversation history if provided
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (
            !msg.content ||
            typeof msg.content !== 'string' ||
            !msg.content.trim()
          ) {
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

      const finalPrompt = this.promptBuilder.build(
        context,
        safeMetadata,
        input.contactSummary,
      );

      const { text, usage } = await generateText({
        model,
        system: finalPrompt,
        messages,
      });

      const safeText =
        text?.trim() || "I'm having trouble responding right now.";

      this.logger.log(`Response generated for ${context.agentId}`);

      // Persist agent response
      await this.messagePersistenceService.handleOutgoingMessage(
        safeText,
        persistenceContext,
        contactId,
        conversationId,
      );

      // Log LLM usage (fire-and-forget)
      if (usage) {
        this.llmUsageLogRepository
          .create({
            agentId: new Types.ObjectId(context.agentId),
            clientId: new Types.ObjectId(context.clientId),
            channelId: new Types.ObjectId(context.channelId),
            contactId,
            conversationId,
            provider: context.llmConfig.provider,
            llmModel: context.llmConfig.model,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
            operationType: 'chat',
          })
          .catch((err) => {
            this.logger.error(`Failed to log LLM usage: ${err.message}`);
          });
      }

      // Trigger async summarization (fire-and-forget)
      this.conversationSummaryService
        .checkAndSummarizeIfNeeded(
          conversationId,
          new Types.ObjectId(context.agentId),
          context,
        )
        .catch((err) => {
          this.logger.error(`Background summary check failed: ${err.message}`);
        });

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
}
