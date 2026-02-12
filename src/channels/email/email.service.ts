import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentChannelRepository } from '../../database/repositories/agent-channel.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { IncomingEmailDto } from './dto/incoming-email.dto';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

const POLL_INTERVAL_MS = 30_000;

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(
    private readonly agentService: AgentService,
    private readonly agentChannelRepository: AgentChannelRepository,
    private readonly agentRepository: AgentRepository,
  ) {}

  onModuleInit() {
    this.logger.log(
      `[Email] Starting IMAP polling (every ${POLL_INTERVAL_MS / 1000}s)`,
    );
    this.pollTimer = setInterval(() => this.pollAllMailboxes(), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async pollAllMailboxes(): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const channels =
        await this.agentChannelRepository.findAllActiveWithEmail();

      for (const channel of channels) {
        try {
          await this.pollMailbox(channel);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[Email] Failed to poll mailbox ${channel.channelConfig.email}: ${message}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  async pollMailbox(agentChannel: any): Promise<void> {
    const { channelConfig } = agentChannel;

    const client = new ImapFlow({
      host: channelConfig.imapHost || 'imap.gmail.com',
      port: channelConfig.imapPort || 993,
      secure: true,
      auth: {
        user: channelConfig.email,
        pass: channelConfig.password,
      },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      for await (const msg of client.fetch(
        { seen: false },
        { envelope: true, bodyParts: ['1'], uid: true },
      )) {
        try {
          const envelope = msg.envelope;
          const from = envelope?.from?.[0]?.address || '';
          const to = envelope?.to?.[0]?.address || channelConfig.email;
          const textBuffer = msg.bodyParts?.get('1');

          const dto: IncomingEmailDto = {
            from,
            to,
            subject: envelope?.subject || '(no subject)',
            text: textBuffer ? textBuffer.toString() : '',
            messageId: envelope?.messageId || undefined,
          };

          await this.handleIncoming(dto);

          // Mark as seen after successful processing
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[Email] Failed to process message uid=${msg.uid}: ${message}`,
          );
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }
  }

  async handleIncoming(dto: IncomingEmailDto): Promise<void> {
    this.logger.log(`[Email] Incoming email from=${dto.from} to=${dto.to}`);

    // Route: find agent channel by recipient email
    const agentChannel = await this.agentChannelRepository.findByEmail(dto.to);

    if (!agentChannel) {
      this.logger.warn(
        `[Email] No active agent_channel found for email=${dto.to}. Check if channel exists and is active.`,
      );
      return;
    }

    const agent = await this.agentRepository.findById(agentChannel.agentId);

    const context: AgentContext = {
      agentId: agentChannel.agentId,
      clientId: agentChannel.clientId,
      systemPrompt: agent?.systemPrompt ?? '',
      llmConfig: {
        ...agentChannel.llmConfig,
        apiKey: process.env.OPENAI_API_KEY, // TODO: Remove - temporary override for testing
      },
      channelConfig: agentChannel.channelConfig,
    };

    const input: AgentInput = {
      channel: 'email',
      externalUserId: dto.from,
      conversationId: `${dto.to}:${dto.from}`,
      message: {
        type: 'text',
        text: dto.text,
      },
      metadata: {
        subject: dto.subject,
        messageId: dto.messageId,
      },
    };

    const output = await this.agentService.run(input, context);

    if (output.reply) {
      this.logger.log(`[Email] Sending reply to ${dto.from}`);

      await this.sendEmail(
        agentChannel.channelConfig,
        dto.from,
        `Re: ${dto.subject}`,
        output.reply.text,
      );
    }
  }

  private async sendEmail(
    channelConfig: {
      email?: string;
      password?: string;
      smtpHost?: string;
      smtpPort?: number;
    },
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: channelConfig.smtpHost || 'smtp.gmail.com',
      port: channelConfig.smtpPort || 587,
      secure: false,
      auth: {
        user: channelConfig.email,
        pass: channelConfig.password,
      },
    });

    try {
      await transporter.sendMail({
        from: channelConfig.email,
        to,
        subject,
        text,
      });

      this.logger.log(`[Email] Message sent successfully to ${to}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Email] Failed to send email: ${message}`);
      throw new Error(`Email send failed: ${message}`);
    }
  }
}
