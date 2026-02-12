import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/channels/email/email.service';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { AgentService } from '../src/agent/agent.service';
import { ChannelProvider } from '../src/channels/channel-provider.enum';
import * as request from 'supertest';

// Mock both nodemailer and imapflow modules globally
jest.mock('nodemailer');
jest.mock('imapflow');

describe('Concurrent Channels (e2e)', () => {
  let app: INestApplication;
  let emailService: EmailService;
  let connection: Connection;
  let mockSendMail: jest.Mock;
  let mockAgentService: Partial<AgentService>;

  // IDs for setup
  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const clientAgentId = clientAgentIdObj.toString();
  
  // Valid Channels Config
  const validPhoneNumberId = 'valid-phone-123';
  const validBotEmail = 'bot@example.com';
  
  // Test Data
  const whatsappUserPhone = '1234567890';
  const emailUserAddress = 'user@example.com';

  beforeAll(async () => {
    // 1. Setup External Mocks
    mockSendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    // Mock global fetch for WhatsApp Service to avoid network errors
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
      json: jest.fn().mockResolvedValue({}),
    } as any);

    // 2. Setup AgentService Mock
    mockAgentService = {
      run: jest.fn().mockImplementation(async (input, context) => {
        return {
          reply: {
            type: 'text',
            text: `Reply to ${input.channel}`,
          },
          conversationId: input.conversationId,
          usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        };
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
    if (connection) {
      await connection.collection('clients').deleteMany({});
      await connection.collection('agents').deleteMany({});
      await connection.collection('client_agents').deleteMany({});
    }

    // Create Client
    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'Concurrent Test Client',
      type: 'individual',
      status: 'active',
    });

    // Create Agent
    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'Concurrent Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    });

    // Create ClientAgent with BOTH Email and WhatsApp
    await connection.collection('client_agents').insertOne({
      _id: clientAgentIdObj,
      clientId: clientId as any,
      agentId: agentId as any,
      price: 0,
      status: 'active',
      channels: [
        {
          provider: 'smtp',
          status: 'active',
          credentials: {
            email: validBotEmail,
            password: 'password123',
            imapHost: 'imap.test.com',
            imapPort: 993,
            smtpHost: 'smtp.test.com',
            smtpPort: 587,
          },
          llmConfig: { provider: 'openai', model: 'gpt-4' },
        },
        {
          provider: 'whatsapp',
          status: 'active',
          credentials: {
            phoneNumberId: validPhoneNumberId,
          },
          llmConfig: { provider: 'openai', model: 'gpt-4' },
        },
      ],
    });
  });

  afterAll(async () => {
    if (connection) {
        await connection.collection('clients').deleteMany({});
        await connection.collection('agents').deleteMany({});
        await connection.collection('client_agents').deleteMany({});
    }
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to mock IMAP fetching behavior
  const setupMockImap = (emailsToYield: any[]) => {
    const mockFetch = jest.fn().mockReturnValue(
      (async function* () {
        for (const email of emailsToYield) {
          yield email;
        }
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
    return mockImapClient;
  };

  it('Scenario 1: Happy Path - Concurrent WhatsApp and Email Processing', async () => {
    // 1. Arrange Email Input
    const mockEmailInput = {
      uid: 101,
      envelope: {
        from: [{ address: emailUserAddress }],
        to: [{ address: validBotEmail }],
        subject: 'Concurrent Test',
        messageId: '<msg-concurrent@test.com>',
      },
      bodyParts: new Map([['1', Buffer.from('Email Hello')]]),
    };
    setupMockImap([mockEmailInput]);

    // 2. Act - Trigger both concurrently
    const emailPromise = emailService.pollAllMailboxes();

    const whatsappPromise = request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: whatsappUserPhone,
                      id: 'msg-wa-1',
                      type: 'text',
                      text: { body: 'WhatsApp Hello' },
                    },
                  ],
                  metadata: { phone_number_id: validPhoneNumberId },
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    await Promise.all([emailPromise, whatsappPromise]);

    // 3. Assert
    // Check Agent Service Calls
    expect(mockAgentService.run).toHaveBeenCalledTimes(2);

    const calls = (mockAgentService.run as jest.Mock).mock.calls;
    const channelsCalled = calls.map(c => c[0].channel).sort();
    expect(channelsCalled).toEqual(['email', 'whatsapp']);

    // Verify WhatsApp flow completed (implicit via 200 OK and agent call)
    // Note: We can't easily check the *outgoing* WhatsApp request without mocking fetch/axios globally. 
    // Assuming AgentService.run returing a reply triggers the send logic in controller/service.

    // Verify Email Reply Sent
    expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
            to: emailUserAddress,
            text: 'Reply to email', // Based on our mock agent implementation
        })
    );
  });

  it('Scenario 2: Unregistered WhatsApp Number', async () => {
    // Act
    await request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: whatsappUserPhone,
                      id: 'msg-wa-unknown',
                      type: 'text',
                      text: { body: 'Who dis?' },
                    },
                  ],
                  metadata: { phone_number_id: 'unknown-phone-id-999' },
                },
              },
            ],
          },
        ],
      })
      .expect(200); // Webhook usually returns 200 even if ignored

    // Assert
    expect(mockAgentService.run).not.toHaveBeenCalled();
  });

  it('Scenario 3: Generic/Unregistered Email Address', async () => {
    // Arrange
    const mockEmailInput = {
      uid: 102,
      envelope: {
        from: [{ address: emailUserAddress }],
        to: [{ address: 'unknown-bot@example.com' }], // Unregistered/Wrong email
        subject: 'Anyone there?',
        messageId: '<msg-unknown@test.com>',
      },
      bodyParts: new Map([['1', Buffer.from('Hello?')]]),
    };
    setupMockImap([mockEmailInput]);

    // Act
    await emailService.pollAllMailboxes();

    // Assert
    expect(mockAgentService.run).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('Scenario 4: Mixed Validity - Valid WhatsApp, Invalid Email', async () => {
    // Arrange
    const mockEmailInput = {
        uid: 103,
        envelope: {
          from: [{ address: emailUserAddress }],
          to: [{ address: 'unknown-bot@example.com' }], 
          subject: 'Wrong Addr',
          messageId: '<msg-wrong@test.com>',
        },
        bodyParts: new Map([['1', Buffer.from('Wrong')]]),
    };
    setupMockImap([mockEmailInput]);

    // Act
    const emailPromise = emailService.pollAllMailboxes();

    const whatsappPromise = request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: whatsappUserPhone,
                      id: 'msg-wa-valid',
                      type: 'text',
                      text: { body: 'Valid WA' },
                    },
                  ],
                  metadata: { phone_number_id: validPhoneNumberId },
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    await Promise.all([emailPromise, whatsappPromise]);

    // Assert
    expect(mockAgentService.run).toHaveBeenCalledTimes(1);
    const args = (mockAgentService.run as jest.Mock).mock.calls[0][0];
    expect(args.channel).toBe('whatsapp');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('Scenario 5: Enforce Channel Coverage', () => {
    // 1. Define expectations
    // These are the providers we explicitly test in this file
    const coveredProviders = [
      ChannelProvider.Smtp,
      // 'whatsapp' is currently used in the test data but technically might be 'Meta' in the generic sense.
      // However, for this enforcement test, we are checking against the ChannelProvider enum.
    ];

    // These are providers that exist but we haven't implemented E2E tests for yet.
    // Listing them here allows the test to pass now, but forces ANY NEW provider 
    // added to the enum to be explicitly dealt with (either tested or added here).
    const knownUntestedProviders = [
      ChannelProvider.Meta, // WhatsApp is likely under Meta in the enum
      ChannelProvider.Twilio,
      ChannelProvider.Sendgrid,
      ChannelProvider.Resend,
    ];

    // 2. Get all defined providers from Enum
    const allProviders = Object.values(ChannelProvider);

    // 3. Find missing coverage
    const missing = allProviders.filter(
      (p) => !coveredProviders.includes(p) && !knownUntestedProviders.includes(p),
    );

    // 4. Assert
    if (missing.length > 0) {
      throw new Error(
        `The following ChannelProviders are not covered by E2E tests: ${missing.join(
          ', ',
        )}. Please add tests for them in 'concurrent-channels.e2e-spec.ts' or explicitly mark them as untested inside the test file.`,
      );
    }
  });
});

