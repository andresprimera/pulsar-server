import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MessageRepository } from '../database/repositories/message.repository';
import { generateText } from 'ai';
import { createLLMModel } from './llm/llm.factory';
import { AgentContext } from './contracts/agent-context';

@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Asynchronously checks token count and generates summary if needed.
   * This method is fire-and-forget and should not block the main flow.
   */
  async checkAndSummarizeIfNeeded(
    channelId: Types.ObjectId,
    userId: Types.ObjectId,
    agentId: Types.ObjectId,
    context: AgentContext,
  ): Promise<void> {
    try {
      // Get token threshold from environment (default to 2000)
      const threshold = this.configService.get<number>(
        'CONVERSATION_TOKEN_THRESHOLD',
        2000,
      );

      // Count tokens in current conversation
      const tokenCount = await this.messageRepository.countTokensInConversation(
        channelId,
        userId,
        agentId,
      );

      this.logger.log(
        `Conversation tokens: ${tokenCount}/${threshold} for user ${userId} agent ${agentId}`,
      );

      if (tokenCount >= threshold) {
        await this.generateSummary(channelId, userId, agentId, context);
      }
    } catch (error) {
      // Log error but don't throw - this is async background processing
      this.logger.error(
        `Error in checkAndSummarizeIfNeeded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async generateSummary(
    channelId: Types.ObjectId,
    userId: Types.ObjectId,
    agentId: Types.ObjectId,
    context: AgentContext,
  ): Promise<void> {
    try {
      // Fetch conversation messages
      const messages = await this.messageRepository.findConversationContext(
        channelId,
        userId,
        agentId,
      );

      if (messages.length === 0) {
        this.logger.warn('No messages to summarize');
        return;
      }

      // Build conversation text
      const conversationText = messages
        .map((msg) => `${msg.type.toUpperCase()}: ${msg.content}`)
        .join('\n');

      // Generate summary using LLM
      const model = createLLMModel(context.llmConfig);
      const { text } = await generateText({
        model,
        system:
          'You are a helpful assistant that creates concise summaries of conversations. ' +
          'Summarize the key points, decisions, and context from the following conversation.',
        prompt: `Please summarize this conversation:\n\n${conversationText}`,
      });

      const summary = text?.trim() || 'Unable to generate summary';

      // Save summary as a message
      await this.messageRepository.create({
        content: summary,
        type: 'summary',
        userId,
        agentId,
        channelId,
        status: 'active',
      });

      this.logger.log(
        `Summary generated and saved for user ${userId} agent ${agentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error generating summary: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
