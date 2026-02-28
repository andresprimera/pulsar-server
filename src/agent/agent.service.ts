import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';
import { AgentContext } from './contracts/agent-context';
import { createLLMModel } from './llm/llm.factory';
import { MessagePersistenceService } from '../channels/shared/message-persistence.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly messagePersistenceService: MessagePersistenceService,
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
      // Automatically handle incoming message persistence and get conversation history
      const { contact, conversationHistory } =
        await this.messagePersistenceService.handleIncomingMessage(
          input.message.text,
          {
            channelId: context.channelId,
            agentId: context.agentId,
            clientId: context.clientId,
            externalUserId: input.externalUserId,
            channelType: input.channel as 'whatsapp' | 'tiktok' | 'instagram',
            userName: input.externalUserId, // Use external ID as name initially
          },
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

      const { text } = await generateText({
        model,
        system: context.systemPrompt,
        messages,
      });

      const safeText =
        text?.trim() || "I'm having trouble responding right now.";

      this.logger.log(`Response generated for ${context.agentId}`);

      // Automatically handle outgoing message persistence
      await this.messagePersistenceService.handleOutgoingMessage(
        safeText,
        {
          channelId: context.channelId,
          agentId: context.agentId,
          clientId: context.clientId,
          externalUserId: input.externalUserId,
          channelType: input.channel as 'whatsapp' | 'tiktok' | 'instagram',
          userName: input.externalUserId,
        },
        contact._id,
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
}
