import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/channels/email/email.service';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { AgentService } from '../src/agent/agent.service';

// Mock both nodemailer and imapflow modules globally
jest.mock('nodemailer');
jest.mock('imapflow');

describe('Email Feature (e2e)', () => {
  let app: INestApplication;
  let emailService: EmailService;
  let connection: Connection;
  let mockSendMail: jest.Mock;
  let mockAgentService: Partial<AgentService>;

  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const clientAgentId = clientAgentIdObj.toString();
  const emailChannelIdObj = new Types.ObjectId();
  const senderEmail = 'user@example.com';
  const botEmail = 'support@example.com';

  beforeAll(async () => {
    // 1. Setup External Mocks
    mockSendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    // 2. Setup AgentService Mock
    mockAgentService = {
      run: jest.fn().mockResolvedValue({
        reply: {
          type: 'text',
          text: 'This is a mock reply from the agent.',
        },
        conversationId: 'mock-conv-id',
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
      }),
    };

    // 3. Compile Module with overrides
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AgentService)
      .useValue(mockAgentService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    emailService = moduleFixture.get<EmailService>(EmailService);
    connection = moduleFixture.get<Connection>(getConnectionToken());

    // 4. Seed Database
    // Clean up first
    if (connection) {
      await connection.collection('clients').deleteOne({ _id: clientIdObj });
      await connection.collection('agents').deleteOne({ _id: agentIdObj });
      await connection
        .collection('client_agents')
        .deleteOne({ _id: clientAgentIdObj });
      await connection.collection('channels').deleteOne({ _id: emailChannelIdObj });
    }

    await connection.collection('channels').insertOne({
      _id: emailChannelIdObj,
      name: 'E2E Test Email Channel',
      type: 'email',
      supportedProviders: ['smtp'],
    });

    // Create Client
    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'E2E Test Client',
      type: 'individual',
      status: 'active',
    });

    // Create Agent
    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'E2E Email Agent',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    });

    // Create ClientAgent with embedded email channel
    await connection.collection('client_agents').insertOne({
      _id: clientAgentIdObj,
      clientId: clientId as any,
      agentId: agentId as any,
      price: 0,
      status: 'active',
      channels: [
        {
          channelId: emailChannelIdObj,
          provider: 'smtp',
          status: 'active',
          email: botEmail,
          credentials: {
            email: botEmail,
            password: 'password123',
            imapHost: 'imap.test.com',
            imapPort: 993,
            smtpHost: 'smtp.test.com',
            smtpPort: 587,
          },
          llmConfig: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      ],
    });
  });

  afterAll(async () => {
    if (connection) {
      await connection.collection('clients').deleteOne({ _id: clientIdObj });
      await connection.collection('agents').deleteOne({ _id: agentIdObj });
      await connection
        .collection('client_agents')
        .deleteOne({ _id: clientAgentIdObj });
      await connection.collection('channels').deleteOne({ _id: emailChannelIdObj });
    }
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should poll IMAP, find email, process it via AgentService, and send reply via SMTP', async () => {
    // Arrange
    const mockEmail = {
      uid: 123,
      envelope: {
        from: [{ address: senderEmail }],
        to: [{ address: botEmail }],
        subject: 'Hello Bot',
        messageId: '<msg-1@test.com>',
      },
      bodyParts: new Map([['1', Buffer.from('Hello there!')]]),
    };

    // We use a generator for fetch since the service iterates over it
    const mockFetch = jest.fn().mockReturnValue(
      (async function* () {
        yield mockEmail;
      })(),
    );

    const mockImapClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
      fetch: mockFetch,
      messageFlagsAdd: jest.fn().mockResolvedValue(true),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    // Return our custom client for this test run
    (ImapFlow as unknown as jest.Mock).mockReturnValue(mockImapClient);

    // Act
    // Manually trigger the polling method logic
    await emailService.pollAllMailboxes();

    // Assert
    // 1. Connection established
    expect(ImapFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'imap.test.com',
        auth: expect.objectContaining({ user: botEmail }),
      }),
    );
    expect(mockImapClient.connect).toHaveBeenCalled();

    // 2. Email fetched
    expect(mockFetch).toHaveBeenCalled();

    // 3. AgentService invoked
    expect(mockAgentService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        externalUserId: senderEmail,
        message: { type: 'text', text: 'Hello there!' },
      }),
      expect.anything(),
    );

    // 4. Reply sent via SMTP
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.test.com',
      }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: botEmail,
        to: senderEmail,
        subject: 'Re: Hello Bot',
        text: 'This is a mock reply from the agent.',
      }),
    );

    // 5. Message marked as seen
    expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
      123,
      ['\\Seen'],
      { uid: true },
    );
  });

  it('should not reply if email is not addressed to the agent channel', async () => {
    // Arrange
    const mockEmail = {
      uid: 456,
      envelope: {
        from: [{ address: senderEmail }],
        to: [{ address: 'wrong-email@example.com' }], // Address doesn't match channel config
        subject: 'Spam',
      },
      bodyParts: new Map([['1', Buffer.from('Spam')]]),
    };

    const mockFetch = jest.fn().mockReturnValue(
      (async function* () {
        yield mockEmail;
      })(),
    );

    const mockImapClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
      fetch: mockFetch,
      messageFlagsAdd: jest.fn().mockResolvedValue(true),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    (ImapFlow as unknown as jest.Mock).mockReturnValue(mockImapClient);

    // Act
    await emailService.pollAllMailboxes();

    // Assert
    expect(mockFetch).toHaveBeenCalled();
    // AgentService NOT called
    expect(mockAgentService.run).not.toHaveBeenCalled();
    // No email sent
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
