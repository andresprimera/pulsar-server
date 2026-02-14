import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { MessagePersistenceService } from '../shared/message-persistence.service';
import { decryptRecord, decrypt } from '../../database/utils/crypto.util';

const VERIFY_TOKEN = 'test-token';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly agentRepository: AgentRepository,
    private readonly messagePersistenceService: MessagePersistenceService,
  ) {}

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
  }

  private async sendMessage(to: string, text: string): Promise<void> {
    const url = 'http://localhost:3005/whatsapp/send';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `[WhatsApp] Failed to send message: ${response.status} ${errorBody}`,
      );
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    this.logger.log(`[WhatsApp] Message sent successfully to ${to}`);
  }

  async handleIncoming(payload: any): Promise<void> {
    // TODO: deduplicate message.id to avoid double-processing

    if (!payload.entry?.[0]?.changes?.[0]?.value?.messages) {
      return;
    }

    const value = payload.entry[0].changes[0].value;
    const message = value.messages[0];

    if (message.type !== 'text') {
      return;
    }

    const phoneNumberId = value.metadata?.phone_number_id;

    this.logger.log(
      `[WhatsApp] Incoming message metdata: ${JSON.stringify(value.metadata)}`,
    );
    this.logger.log(`[WhatsApp] Extracted phoneNumberId: ${phoneNumberId}`);

    // Route: find active ClientAgent with matching phoneNumberId in embedded channels
    const clientAgent = await this.clientAgentRepository.findOneByPhoneNumberId(
      phoneNumberId,
    );

    if (!clientAgent) {
      this.logger.warn(
        `[WhatsApp] No active ClientAgent found for phoneNumberId=${phoneNumberId}.`,
      );
      return;
    }

    // Extract the specific channel config
    const channelConfig = clientAgent.channels.find(
      (c) =>
        c.status === 'active' && c.credentials?.phoneNumberId === phoneNumberId,
    );

    if (!channelConfig) {
      this.logger.warn(
        `[WhatsApp] Channel config not found in ClientAgent for phoneNumberId=${phoneNumberId} (mismatch).`,
      );
      return;
    }

    // Guard: credentials may be undefined if select('+channels.credentials') was missed
    if (!channelConfig.credentials) {
      this.logger.error(
        `[WhatsApp] Credentials missing for phoneNumberId=${phoneNumberId}. Possible select('+channels.credentials') omission.`,
      );
      return;
    }

    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      this.logger.warn(
        `[WhatsApp] Agent ${clientAgent.agentId} is not active. Skipping message.`,
      );
      return;
    }

    // Use shared message persistence service
    const { user, conversationHistory } =
      await this.messagePersistenceService.handleIncomingMessage(
        message.text.body,
        {
          channelId: channelConfig.channelId,
          agentId: clientAgent.agentId,
          clientId: clientAgent.clientId,
          externalUserId: message.from,
          userName: message.from, // Use phone number as name initially
        },
      );

    const context: AgentContext = {
      agentId: clientAgent.agentId,
      clientId: clientAgent.clientId,
      systemPrompt: agent.systemPrompt,
      llmConfig: {
        ...channelConfig.llmConfig,
        apiKey: decrypt(
          channelConfig.llmConfig.apiKey || (process.env.OPENAI_API_KEY ?? ''),
        ),
      },
      channelConfig: decryptRecord(channelConfig.credentials),
    };

    const input: AgentInput = {
      channel: 'whatsapp',
      externalUserId: message.from,
      conversationId: `${phoneNumberId}:${message.from}`,
      message: {
        type: 'text',
        text: message.text.body,
      },
      metadata: {
        messageId: message.id,
        phoneNumberId,
      },
    };

    const output = await this.agentService.run(
      input,
      context,
      conversationHistory,
    );

    if (output.reply) {
      this.logger.log(
        `[WhatsApp] Sending to ${message.from}: ${output.reply.text}`,
      );

      await this.sendMessage(message.from, output.reply.text);

      // Use shared message persistence service for outgoing message
      await this.messagePersistenceService.handleOutgoingMessage(
        output.reply.text,
        {
          channelId: channelConfig.channelId,
          agentId: clientAgent.agentId,
          clientId: clientAgent.clientId,
          externalUserId: message.from,
          userName: message.from,
        },
        user._id,
        context,
      );
    }
  }
}
