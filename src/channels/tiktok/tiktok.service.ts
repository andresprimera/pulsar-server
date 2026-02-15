import { Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
import { TIKTOK_API_BASE_URL } from './tiktok.config';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly agentRepository: AgentRepository,
  ) {}

  async handleIncoming(payload: any): Promise<void> {
    if (payload?.event !== 'message.received') {
      return;
    }

    const data = payload.data;
    if (!data?.message || data.message.type !== 'text') {
      return;
    }

    const recipientUserId = data.recipient?.user_id;
    if (!recipientUserId) {
      this.logger.warn('[TikTok] Missing recipient.user_id in payload.');
      return;
    }

    this.logger.log(
      `[TikTok] Incoming message from sender=${data.sender?.user_id} to recipient=${recipientUserId}`,
    );

    // Route: find active ClientAgent with matching tiktokUserId in embedded channels
    const clientAgent =
      await this.clientAgentRepository.findOneByTiktokUserId(recipientUserId);

    if (!clientAgent) {
      this.logger.warn(
        `[TikTok] No active ClientAgent found for tiktokUserId=${recipientUserId}.`,
      );
      return;
    }

    // Extract the specific channel config
    const channelConfig = clientAgent.channels.find(
      (c) =>
        c.status === 'active' &&
        c.credentials?.tiktokUserId === recipientUserId,
    );

    if (!channelConfig) {
      this.logger.warn(
        `[TikTok] Channel config not found in ClientAgent for tiktokUserId=${recipientUserId} (mismatch).`,
      );
      return;
    }

    // Guard: credentials may be undefined if select('+channels.credentials') was missed
    if (!channelConfig.credentials) {
      this.logger.error(
        `[TikTok] Credentials missing for tiktokUserId=${recipientUserId}. Possible select('+channels.credentials') omission.`,
      );
      return;
    }

    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      this.logger.warn(
        `[TikTok] Agent ${clientAgent.agentId} is not active. Skipping message.`,
      );
      return;
    }

    const context: AgentContext = {
      agentId: clientAgent.agentId,
      clientId: clientAgent.clientId,
      channelId: channelConfig.channelId.toString(),
      systemPrompt: agent.systemPrompt,
      llmConfig: {
        ...channelConfig.llmConfig,
        // TODO: [HACK] REMOVE THIS IN PRODUCTION.
        // Forcing 'openai' provider and system key for dev/testing ease.
        // This bypasses client billing!
        provider: (channelConfig.llmConfig.provider || 'openai') as any,
        apiKey: decrypt(
          channelConfig.llmConfig.apiKey &&
            !channelConfig.llmConfig.apiKey.includes('REPLACE_ME')
            ? channelConfig.llmConfig.apiKey
            : process.env.OPENAI_API_KEY ?? '',
        ),
        model: channelConfig.llmConfig.model || 'gpt-4o',
      },
      channelConfig: decryptRecord(channelConfig.credentials),
    };

    const input: AgentInput = {
      channel: 'tiktok',
      externalUserId: data.sender.user_id,
      conversationId: data.conversation_id,
      message: {
        type: 'text',
        text: data.message.text,
      },
      metadata: {
        messageId: data.message_id,
        senderUsername: data.sender?.username,
      },
    };

    const output = await this.agentService.run(input, context);

    if (output.reply) {
      this.logger.log(
        `[TikTok] Sending reply to sender=${data.sender.user_id}`,
      );
      const decryptedCredentials = decryptRecord(channelConfig.credentials);
      
      try {
        await this.sendMessage({
          recipientId: data.sender.user_id,
          conversationId: data.conversation_id,
          text: output.reply.text,
          accessToken: decryptedCredentials.accessToken,
        });
        this.logger.log(`[TikTok] Reply sent successfully.`);
      } catch (error) {
        this.logger.error(`[TikTok] Failed to send reply: ${error.message}`);
      }
    }
  }

  private async sendMessage(params: {
    recipientId: string;
    conversationId: string;
    text: string;
    accessToken: string;
  }): Promise<void> {
    const { recipientId, conversationId, text, accessToken } = params;
    
    const url = `${TIKTOK_API_BASE_URL}/message/send/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: recipientId,
        conversation_id: conversationId,
        message_type: 'text',
        text: {
          content: text,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TikTok API error: ${response.status} ${errorText}`);
    }
  }
}
