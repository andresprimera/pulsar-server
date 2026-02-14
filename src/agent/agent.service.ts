import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';
import { AgentContext } from './contracts/agent-context';
import { createLLMModel } from './llm/llm.factory';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  async run(
    input: AgentInput,
    context: AgentContext,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<AgentOutput> {
    this.logger.log(
      `Processing ${context.agentId} for client ${context.clientId} ` +
        `using provider=${context.llmConfig.provider} model=${context.llmConfig.model}`,
    );

    try {
      const model = createLLMModel(context.llmConfig);

      // Build messages array with conversation history
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        conversationHistory || [];

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
