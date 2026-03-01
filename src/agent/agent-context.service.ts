import { Injectable, Logger } from '@nestjs/common';
import { AgentContext } from './contracts/agent-context';
import { ClientRepository } from '@persistence/repositories/client.repository';

@Injectable()
export class AgentContextService {
  private readonly logger = new Logger(AgentContextService.name);

  constructor(private readonly clientRepository: ClientRepository) {}

  async enrichContext(context: AgentContext): Promise<AgentContext> {
    const client = await this.clientRepository.findById(context.clientId);

    if (!client) {
      this.logger.warn(
        `Client ${context.clientId} not found. Using original system prompt.`,
      );
      return context;
    }

    const contextLines: string[] = [];
    if (client.name) {
      contextLines.push(`You are representing "${client.name}".`);
    }
    if (context.agentName) {
      contextLines.push(`Your role is "${context.agentName}".`);
    }
    if (contextLines.length > 0) {
      contextLines.push(
        'In your first message to a new user, introduce yourself by mentioning the company you represent and your role.',
      );
    }

    const enrichedPrompt =
      contextLines.length > 0
        ? `${context.systemPrompt}\n\n${contextLines.join(' ')}`
        : context.systemPrompt;

    return {
      ...context,
      clientName: client.name,
      systemPrompt: enrichedPrompt,
    };
  }
}
