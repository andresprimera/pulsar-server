import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageRepository } from '../../database/repositories/message.repository';
import { ContactRepository } from '../../database/repositories/contact.repository';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { AgentContext } from '../../agent/contracts/agent-context';

export interface MessagePersistenceContext {
  channelId: Types.ObjectId | string;
  agentId: Types.ObjectId | string;
  clientId: Types.ObjectId | string;
  externalUserId: string;
  channelType: 'whatsapp' | 'tiktok' | 'instagram';
  userName: string;
}

@Injectable()
export class MessagePersistenceService {
  private readonly logger = new Logger(MessagePersistenceService.name);

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly contactRepository: ContactRepository,
    private readonly conversationSummaryService: ConversationSummaryService,
  ) {}

  /**
   * Finds or creates a contact by external ID (e.g., phone number, TikTok user ID)
   */
  async findOrCreateContact(
    externalUserId: string,
    clientId: Types.ObjectId | string,
    channelType: 'whatsapp' | 'tiktok' | 'instagram',
    name: string,
  ): Promise<any> {
    return this.contactRepository.findOrCreate(
      externalUserId,
      new Types.ObjectId(clientId),
      channelType,
      name,
    );
  }

  /**
   * Saves an incoming user message to the database
   */
  async saveUserMessage(
    content: string,
    context: MessagePersistenceContext,
    contactId: Types.ObjectId,
  ): Promise<void> {
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
      `Saved user message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
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
   * Complete message persistence flow for incoming messages
   * Returns the conversation history and contact object
   */
  async handleIncomingMessage(
    content: string,
    context: MessagePersistenceContext,
  ): Promise<{
    contact: any;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  }> {
    // Find or create contact
    const contact = await this.findOrCreateContact(
      context.externalUserId,
      context.clientId,
      context.channelType,
      context.userName,
    );

    // Save user message
    await this.saveUserMessage(content, context, contact._id as Types.ObjectId);

    // Get conversation context
    const conversationHistory = await this.getConversationContext(
      context,
      contact._id as Types.ObjectId,
    );

    return { contact, conversationHistory };
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
