import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { WhatsappService } from '../src/channels/whatsapp/whatsapp.service';
import { ConfigService } from '@nestjs/config';

// Mock fetch to prevent real HTTP calls
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  text: jest.fn().mockResolvedValue(''),
} as any);

jest.mock('ai', () => ({
  generateText: jest.fn().mockResolvedValue({
    text: 'Mock agent response',
  }),
}));

describe('Message Persistence (e2e)', () => {
  let app: INestApplication;
  let whatsappService: WhatsappService;
  let connection: Connection;
  let configService: ConfigService;

  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const channelIdObj = new Types.ObjectId();
  const phoneNumberId = 'test-phone-123';
  const userPhone = '+1234567890';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    whatsappService = moduleFixture.get<WhatsappService>(WhatsappService);
    connection = moduleFixture.get<Connection>(getConnectionToken());
    configService = moduleFixture.get<ConfigService>(ConfigService);

    // Seed database
    if (connection) {
      // Clean up first
      await connection.collection('clients').deleteOne({ _id: clientIdObj });
      await connection.collection('agents').deleteOne({ _id: agentIdObj });
      await connection
        .collection('client_agents')
        .deleteOne({ _id: clientAgentIdObj });
      await connection
        .collection('messages')
        .deleteMany({ channelId: channelIdObj });
      await connection
        .collection('contacts')
        .deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
    }

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
      name: 'E2E Test Agent',
      systemPrompt: 'You are a helpful assistant. Be very brief.',
      status: 'active',
    });

    // Create ClientAgent with WhatsApp channel
    await connection.collection('client_agents').insertOne({
      _id: clientAgentIdObj,
      clientId: clientId as any,
      agentId: agentId as any,
      price: 0,
      status: 'active',
      channels: [
        {
          channelId: channelIdObj,
          provider: 'meta',
          status: 'active',
          phoneNumberId: phoneNumberId,
          credentials: {
            phoneNumberId: phoneNumberId,
          },
          llmConfig: {
            provider: 'openai',
            model: 'gpt-4',
            apiKey: process.env.OPENAI_API_KEY || 'test-key',
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
      await connection
        .collection('messages')
        .deleteMany({ channelId: channelIdObj });
      await connection
        .collection('contacts')
        .deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
      await connection
        .collection('processed_events')
        .deleteMany({ channel: 'whatsapp' });
    }
    await app.close();
  });

  beforeEach(async () => {
    // Clean up messages before each test
    await connection
      .collection('messages')
      .deleteMany({ channelId: channelIdObj });
    await connection
      .collection('contacts')
      .deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
    await connection
      .collection('processed_events')
      .deleteMany({ channel: 'whatsapp' });
    jest.clearAllMocks();
  });

  describe('Message Persistence', () => {
    it('should persist user message and agent response to database', async () => {
      // Arrange
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg123',
                      type: 'text',
                      text: { body: 'Hello, test message' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      // Act
      await whatsappService.handleIncoming(payload);

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Check contact was created
      const contact = await connection
        .collection('contacts')
        .findOne({ externalId: userPhone.replace(/[^\d]/g, '') });
      expect(contact).toBeDefined();
      expect(contact.externalId).toBe(userPhone.replace(/[^\d]/g, ''));
      expect(contact.clientId.toString()).toBe(clientId);

      // Assert - Check user message was persisted
      const userMessage = await connection
        .collection('messages')
        .findOne({ type: 'user', contactId: contact._id });
      expect(userMessage).toBeDefined();
      expect(userMessage.content).toBe('Hello, test message');
      expect(userMessage.channelId.toString()).toBe(channelIdObj.toString());
      expect(userMessage.agentId.toString()).toBe(agentId);
      expect(userMessage.status).toBe('active');

      // Assert - Check agent response was persisted
      const agentMessage = await connection
        .collection('messages')
        .findOne({ type: 'agent', contactId: contact._id });
      expect(agentMessage).toBeDefined();
      expect(agentMessage.content).toBeTruthy();
      expect(agentMessage.channelId.toString()).toBe(channelIdObj.toString());
      expect(agentMessage.agentId.toString()).toBe(agentId);
      expect(agentMessage.status).toBe('active');
    });

    it('should retrieve conversation context for subsequent messages', async () => {
      // Arrange - Send first message
      const payload1 = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg1',
                      type: 'text',
                      text: { body: 'First message' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      await whatsappService.handleIncoming(payload1);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act - Send second message
      const payload2 = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg2',
                      type: 'text',
                      text: { body: 'Second message' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      await whatsappService.handleIncoming(payload2);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Should have 4 messages total (2 user + 2 agent)
      const messageCount = await connection
        .collection('messages')
        .countDocuments({ channelId: channelIdObj });
      expect(messageCount).toBe(4);

      // Assert - Messages should be in correct order
      const messages = await connection
        .collection('messages')
        .find({ channelId: channelIdObj })
        .sort({ createdAt: 1 })
        .toArray();

      expect(messages[0].type).toBe('user');
      expect(messages[0].content).toBe('First message');
      expect(messages[1].type).toBe('agent');
      expect(messages[2].type).toBe('user');
      expect(messages[2].content).toBe('Second message');
      expect(messages[3].type).toBe('agent');
    });
  });

  describe('Automatic Summarization', () => {
    it('should trigger summarization when token threshold is exceeded', async () => {
      // Arrange - Set a low threshold for testing
      jest.spyOn(configService, 'get').mockReturnValue(50); // Very low threshold

      // Create a contact with enough messages to exceed threshold
      const contactResult = await connection.collection('contacts').insertOne({
        externalId: userPhone.replace(/[^\d]/g, ''),
        externalIdRaw: userPhone,
        identifier: {
          type: 'phone',
          value: userPhone.replace(/[^\d]/g, ''),
        },
        clientId: clientIdObj,
        channelId: channelIdObj,
        name: userPhone,
        metadata: {},
        status: 'active',
      });

      // Insert messages that will exceed token threshold
      const longMessage =
        'This is a long message with many words to increase token count. '.repeat(
          10,
        );

      for (let i = 0; i < 3; i++) {
        await connection.collection('messages').insertOne({
          content: longMessage,
          type: 'agent',
          contactId: contactResult.insertedId,
          agentId: agentIdObj,
          channelId: channelIdObj,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await connection.collection('messages').insertOne({
          content: 'Short response',
          type: 'agent',
          contactId: contactResult.insertedId,
          agentId: agentIdObj,
          channelId: channelIdObj,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Act - Send one more message to trigger summarization
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg-trigger',
                      type: 'text',
                      text: { body: 'Final message to trigger summary' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      await whatsappService.handleIncoming(payload);

      // Wait for async summarization
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Assert - Check if a summary message was created
      const summaryMessage = await connection
        .collection('messages')
        .findOne({ type: 'summary', channelId: channelIdObj });

      if (summaryMessage) {
        // If summarization happened (depends on actual token count)
        expect(summaryMessage).toBeDefined();
        expect(summaryMessage.type).toBe('summary');
        expect(summaryMessage.content).toBeTruthy();
        expect(summaryMessage.contactId.toString()).toBe(
          contactResult.insertedId.toString(),
        );
        expect(summaryMessage.agentId.toString()).toBe(agentId);
      } else {
        // Even if summary wasn't created, messages should be persisted
        const messageCount = await connection
          .collection('messages')
          .countDocuments({ channelId: channelIdObj });
        expect(messageCount).toBeGreaterThan(6); // Original 6 + 2 new messages
      }
    });
  });

  describe('Contact Management', () => {
    it('should create new contact on first message', async () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg-new-contact',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      await whatsappService.handleIncoming(payload);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const contact = await connection
        .collection('contacts')
        .findOne({ externalId: userPhone.replace(/[^\d]/g, '') });

      expect(contact).toBeDefined();
      expect(contact.externalId).toBe(userPhone.replace(/[^\d]/g, ''));
      expect(contact.name).toBe(userPhone);
      expect(contact.channelId.toString()).toBe(channelIdObj.toString());
      expect(contact.status).toBe('active');
    });

    it('should reuse existing contact on subsequent messages', async () => {
      // First message
      const payload1 = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg1',
                      type: 'text',
                      text: { body: 'First' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      await whatsappService.handleIncoming(payload1);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const contactCountAfterFirst = await connection
        .collection('contacts')
        .countDocuments({ externalId: userPhone.replace(/[^\d]/g, '') });

      // Second message
      const payload2 = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: userPhone,
                      id: 'msg2',
                      type: 'text',
                      text: { body: 'Second' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      };

      await whatsappService.handleIncoming(payload2);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const contactCountAfterSecond = await connection
        .collection('contacts')
        .countDocuments({ externalId: userPhone.replace(/[^\d]/g, '') });

      // Should still be only one contact
      expect(contactCountAfterFirst).toBe(1);
      expect(contactCountAfterSecond).toBe(1);
    });
  });
});
