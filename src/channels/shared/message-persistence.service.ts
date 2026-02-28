import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageRepository } from '../../database/repositories/message.repository';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { AgentContext } from '../../agent/contracts/agent-context';

export interface MessagePersistenceContext {
  channelId: Types.ObjectId | string;
  agentId: Types.ObjectId | string;
  clientId: Types.ObjectId | string;
  contactId: Types.ObjectId | string;
}

@Injectable()
export class MessagePersistenceService {
  private readonly logger = new Logger(MessagePersistenceService.name);
  private static readonly MISSING_IDENTITY_ERROR =
    'Identity must be resolved before message creation';

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationSummaryService: ConversationSummaryService,
  ) {}

  /**
   * Single entrypoint for creating user messages.
   */
  async createUserMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
  ): Promise<void> {
    if (!contactId || !context.contactId) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    const contextContactId = new Types.ObjectId(context.contactId);
    if (!contactId.equals(contextContactId)) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    await this.messageRepository.create({
      content,
      type: 'user',
      contactId,
      agentId: new Types.ObjectId(context.agentId),
      clientId: new Types.ObjectId(context.clientId),
      channelId: new Types.ObjectId(context.channelId),
      status: 'active',
    });

    this.logger.log(
      `Created user message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
    );
  }

  /**
   * Saves an agent response message to the database
   */
  async saveAgentMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
  ): Promise<void> {
    if (!contactId) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    await this.messageRepository.create({
      content,
      type: 'agent',
      contactId,
      agentId: new Types.ObjectId(context.agentId),
      clientId: new Types.ObjectId(context.clientId),
      channelId: new Types.ObjectId(context.channelId),
      status: 'active',
    });

    this.logger.log(
      `Saved agent message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
    );
  }

  /**
   * Retrieves conversation context (messages since last summary)
   * Returns an array of messages formatted for the agent's conversation history
   */
  async getConversationContext(
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    if (!contactId) {
      throw new BadRequestException(
        MessagePersistenceService.MISSING_IDENTITY_ERROR,
      );
    }

    const messages = await this.messageRepository.findConversationContext(
      new Types.ObjectId(context.channelId),
      contactId,
      new Types.ObjectId(context.agentId),
    );

    return messages.map((msg) => ({
      role: (msg.type === 'user' ? 'user' : 'assistant') as
        | 'user'
        | 'assistant',
      content: msg.content,
    }));
  }

  /**
   * Triggers async token counting and summary generation if needed
   * This is fire-and-forget and will not block the response flow
   */
  triggerSummarization(
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
    agentContext: AgentContext,
  ): void {
    this.conversationSummaryService
      .checkAndSummarizeIfNeeded(
        new Types.ObjectId(context.channelId),
        contactId,
        new Types.ObjectId(context.agentId),
        agentContext,
      )
      .catch((err) => {
        this.logger.error(
          `Background summary check failed: ${err.message}`,
        );
      });
  }

  /**
   * Complete message persistence flow for outgoing agent responses
   */
  async handleOutgoingMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
    agentContext: AgentContext,
  ): Promise<void> {
    // Save agent message
    await this.saveAgentMessage(content, context, contactId);

    // Trigger async summarization check
    this.triggerSummarization(context, contactId, agentContext);
  }
}
