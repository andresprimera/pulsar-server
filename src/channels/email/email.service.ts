import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { IncomingEmailDto } from './dto/incoming-email.dto';
import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { ClientAgent } from '../../database/schemas/client-agent.schema';

const POLL_INTERVAL_MS = 30_000;

export interface EmailCredentials {
  email: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(
    private readonly agentService: AgentService,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly agentRepository: AgentRepository,
  ) {}

  onModuleInit() {
    this.logger.log(
      `[Email] Starting IMAP polling (every ${POLL_INTERVAL_MS / 1000}s)`,
    );
    this.pollTimer = setInterval(
      () => this.pollAllMailboxes(),
      POLL_INTERVAL_MS,
    );
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
      const clientAgents =
        await this.clientAgentRepository.findAllWithActiveEmailChannels();

      for (const clientAgent of clientAgents) {
        // Find all active email channels for this agent
        const emailChannels = clientAgent.channels.filter(
          (c) => c.status === 'active' && c.credentials?.email,
        );

        for (const channel of emailChannels) {
          try {
            await this.pollMailbox(
              decryptRecord(channel.credentials) as EmailCredentials,
              clientAgent,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `[Email] Failed to poll mailbox for clientAgent=${clientAgent._id}: ${message}`,
            );
          }
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  async pollMailbox(
    channelConfig: EmailCredentials,
    _clientAgent: ClientAgent,
  ): Promise<void> {
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
    const clientAgent = await this.clientAgentRepository.findOneByEmail(dto.to);

    if (!clientAgent) {
      this.logger.warn(
        `[Email] No active ClientAgent found for email=${dto.to}. Check if channel exists and is active.`,
      );
      return;
    }

    const channelConfig = clientAgent.channels.find(
      (c) => c.status === 'active' && c.credentials?.email === dto.to,
    );

    if (!channelConfig) {
      this.logger.warn(
        `[Email] Channel config not found in ClientAgent for email=${dto.to} (mismatch).`,
      );
      return;
    }

    // Guard: credentials may be undefined if select('+channels.credentials') was missed
    if (!channelConfig.credentials) {
      this.logger.error(
        `[Email] Credentials missing for email=${dto.to}. Possible select('+channels.credentials') omission.`,
      );
      return;
    }

    const agent = await this.agentRepository.findActiveById(
      clientAgent.agentId,
    );
    if (!agent) {
      this.logger.warn(
        `[Email] Agent ${clientAgent.agentId} is not active. Skipping message.`,
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
        apiKey: decrypt(
          channelConfig.llmConfig.apiKey || (process.env.OPENAI_API_KEY ?? ''),
        ),
      },
      channelConfig: decryptRecord(channelConfig.credentials),
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
        decryptRecord(channelConfig.credentials) as EmailCredentials,
        dto.from,
        `Re: ${dto.subject}`,
        output.reply.text,
      );
    }
  }

  private async sendEmail(
    channelConfig: EmailCredentials,
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
