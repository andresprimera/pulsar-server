import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageRepository } from '../../database/repositories/message.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { AgentContext } from '../../agent/contracts/agent-context';

export interface MessagePersistenceContext {
  channelId: Types.ObjectId | string;
  agentId: Types.ObjectId | string;
  clientId: Types.ObjectId | string;
  externalUserId: string;
  userName: string;
}

@Injectable()
export class MessagePersistenceService {
  private readonly logger = new Logger(MessagePersistenceService.name);

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
    private readonly conversationSummaryService: ConversationSummaryService,
  ) {}

  /**
   * Finds or creates a user by external ID (e.g., phone number, email address)
   */
  async findOrCreateUser(
    externalUserId: string,
    clientId: Types.ObjectId | string,
    name: string,
  ): Promise<any> {
    return this.userRepository.findOrCreateByExternalUserId(
      externalUserId,
      new Types.ObjectId(clientId),
      name,
    );
  }

  /**
   * Saves an incoming user message to the database
   */
  async saveUserMessage(
    content: string,
    context: MessagePersistenceContext,
    userId: Types.ObjectId,
  ): Promise<void> {
    await this.messageRepository.create({
      content,
      type: 'user',
      userId,
      agentId: new Types.ObjectId(context.agentId),
      channelId: new Types.ObjectId(context.channelId),
      status: 'active',
    });

    this.logger.log(
      `Saved user message: user=${userId} agent=${context.agentId} channel=${context.channelId}`,
    );
  }

  /**
   * Saves an agent response message to the database
   */
  async saveAgentMessage(
    content: string,
    context: MessagePersistenceContext,
    userId: Types.ObjectId,
  ): Promise<void> {
    await this.messageRepository.create({
      content,
      type: 'agent',
      userId,
      agentId: new Types.ObjectId(context.agentId),
      channelId: new Types.ObjectId(context.channelId),
      status: 'active',
    });

    this.logger.log(
      `Saved agent message: user=${userId} agent=${context.agentId} channel=${context.channelId}`,
    );
  }

  /**
   * Retrieves conversation context (messages since last summary)
   * Returns an array of messages formatted for the agent's conversation history
   */
  async getConversationContext(
    context: MessagePersistenceContext,
    userId: Types.ObjectId,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await this.messageRepository.findConversationContext(
      new Types.ObjectId(context.channelId),
      userId,
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
    userId: Types.ObjectId,
    agentContext: AgentContext,
  ): void {
    this.conversationSummaryService
      .checkAndSummarizeIfNeeded(
        new Types.ObjectId(context.channelId),
        userId,
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
   * Complete message persistence flow for incoming messages
   * Returns the conversation history and user object
   */
  async handleIncomingMessage(
    content: string,
    context: MessagePersistenceContext,
  ): Promise<{
    user: any;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  }> {
    // Find or create user
    const user = await this.findOrCreateUser(
      context.externalUserId,
      context.clientId,
      context.userName,
    );

    // Save user message
    await this.saveUserMessage(content, context, user._id as Types.ObjectId);

    // Get conversation context
    const conversationHistory = await this.getConversationContext(
      context,
      user._id as Types.ObjectId,
    );

    return { user, conversationHistory };
  }

  /**
   * Complete message persistence flow for outgoing agent responses
   */
  async handleOutgoingMessage(
    content: string,
    context: MessagePersistenceContext,
    userId: Types.ObjectId,
    agentContext: AgentContext,
  ): Promise<void> {
    // Save agent message
    await this.saveAgentMessage(content, context, userId);

    // Trigger async summarization check
    this.triggerSummarization(context, userId, agentContext);
  }
}
