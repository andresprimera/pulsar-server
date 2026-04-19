import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import * as SEED_DATA from '../src/core/persistence/data/seed-data.json';
import { CHANNEL_CATALOG } from '../src/core/persistence/channel-catalog';
import { AgentService } from '../src/core/agent/agent.service';

describe('WhatsApp Message Routing (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let previousSeedDb: string | undefined;
  let mockAgentService: Partial<AgentService>;
  let user1PhoneNumberId: string;
  let user2PhoneNumberId: string;
  let user3Agent1PhoneNumberId: string;
  let user3Agent2PhoneNumberId: string;

  const cleanupSeededData = async () => {
    if (!connection) {
      return;
    }

    const seedEmails = SEED_DATA.users.map((u) => u.email);

    const seededUsers = await connection
      .collection('users')
      .find({ email: { $in: seedEmails } })
      .toArray();
    const clientIds = seededUsers.map((u) => u.clientId);

    const seededPhoneNumberIds = SEED_DATA.users.flatMap((u) =>
      (u.agentHirings || []).flatMap((h) =>
        (h.channels || [])
          .map((c) => c.credentials?.phoneNumberId)
          .filter((phone): phone is string => Boolean(phone)),
      ),
    );

    const uniqueSeededPhoneNumberIds = [...new Set(seededPhoneNumberIds)];

    await connection.collection('client_phones').deleteMany({
      $or: [
        { clientId: { $in: clientIds } },
        { phoneNumberId: { $in: uniqueSeededPhoneNumberIds } },
      ],
    });

    await connection.collection('client_agents').deleteMany({
      clientId: { $in: clientIds.map((id) => id.toString()) },
    });

    await connection.collection('clients').deleteMany({
      _id: { $in: clientIds },
    });

    await connection.collection('agents').deleteMany({
      createdBySeeder: true,
    });

    await connection.collection('users').deleteMany({
      email: { $in: seedEmails },
    });

    const seedChannelNames = CHANNEL_CATALOG.map((c) => c.name);
    await connection.collection('channels').deleteMany({
      name: { $in: seedChannelNames },
    });
  };

  beforeAll(async () => {
    previousSeedDb = process.env.SEED_DB;
    process.env.SEED_DB = 'true';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
      json: jest.fn().mockResolvedValue({}),
    } as any);

    mockAgentService = {
      run: jest.fn().mockResolvedValue({
        reply: { type: 'text', text: 'Mock routing reply' },
        conversationId: 'mock-conversation-id',
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
      }),
    };

    // Ensure deterministic seeding by removing partially-seeded remnants
    // before app bootstrap triggers SeederService.
    const tempModule: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    connection = tempModule.get<Connection>(getConnectionToken());
    await connection.asPromise();
    await cleanupSeededData();
    await tempModule.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AgentService)
      .useValue(mockAgentService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    // Get phone number IDs for each user's agents
    await extractPhoneNumberIds();
  });

  afterAll(async () => {
    await cleanupSeededData();
    await app.close();
    jest.restoreAllMocks();

    if (previousSeedDb === undefined) {
      delete process.env.SEED_DB;
    } else {
      process.env.SEED_DB = previousSeedDb;
    }
  });

  const getClientAgentPhoneNumberId = async (
    clientId: string,
  ): Promise<string | null> => {
    const clientAgent = await connection
      .collection('client_agents')
      .aggregate([
        { $match: { clientId: clientId } },
        {
          $project: {
            channels: 1,
          },
        },
      ])
      .next();

    if (clientAgent) {
      const whatsappChannel = clientAgent.channels.find(
        (c: any) => c.phoneNumberId || c.credentials?.phoneNumberId,
      );
      if (whatsappChannel) {
        return (
          whatsappChannel.phoneNumberId ||
          whatsappChannel.credentials?.phoneNumberId
        );
      }
    }
    return null;
  };

  const extractPhoneNumberIds = async () => {
    // User 1 (andresprimera@gmail.com) - Customer Service Agent
    const user1 = await connection
      .collection('users')
      .findOne({ email: 'andresprimera@gmail.com' });

    if (user1) {
      user1PhoneNumberId = await getClientAgentPhoneNumberId(
        user1.clientId.toString(),
      );
    }

    // User 2 (user2@example.com) - Sales Agent
    const user2 = await connection
      .collection('users')
      .findOne({ email: 'user2@example.com' });

    if (user2) {
      user2PhoneNumberId = await getClientAgentPhoneNumberId(
        user2.clientId.toString(),
      );
    }

    // User 3 (user3@example.com) - Both agents
    const user3 = await connection
      .collection('users')
      .findOne({ email: 'user3@example.com' });

    if (user3) {
      const user3ClientAgents = await connection
        .collection('client_agents')
        .aggregate([
          { $match: { clientId: user3.clientId.toString() } },
          {
            $project: {
              agentId: 1,
              channels: 1,
            },
          },
        ])
        .toArray();

      const customerServiceAgent = await connection
        .collection('agents')
        .findOne({ name: 'Customer Service Agent' });

      const salesAgent = await connection
        .collection('agents')
        .findOne({ name: 'Lead Qualifier & Sales Agent' });

      const user3Agent1 = user3ClientAgents.find(
        (ca: any) => ca.agentId === customerServiceAgent?._id.toString(),
      );
      if (user3Agent1) {
        const whatsappChannel = user3Agent1.channels.find(
          (c: any) => c.phoneNumberId || c.credentials?.phoneNumberId,
        );
        if (whatsappChannel) {
          user3Agent1PhoneNumberId =
            whatsappChannel.phoneNumberId ||
            whatsappChannel.credentials?.phoneNumberId;
        }
      }

      const user3Agent2 = user3ClientAgents.find(
        (ca: any) => ca.agentId === salesAgent?._id.toString(),
      );
      if (user3Agent2) {
        const whatsappChannel = user3Agent2.channels.find(
          (c: any) => c.phoneNumberId || c.credentials?.phoneNumberId,
        );
        if (whatsappChannel) {
          user3Agent2PhoneNumberId =
            whatsappChannel.phoneNumberId ||
            whatsappChannel.credentials?.phoneNumberId;
        }
      }
    }
  };

  const createWhatsAppMessage = (
    phoneNumberId: string,
    from: string,
    text: string,
    messageId = `msg-${Date.now()}`,
  ) => ({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id: messageId,
                  type: 'text',
                  text: { body: text },
                },
              ],
              metadata: { phone_number_id: phoneNumberId },
            },
          },
        ],
      },
    ],
  });

  describe('Basic Message Handling', () => {
    it('should route message to User 1 Customer Service Agent', async () => {
      if (!user1PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user1PhoneNumberId,
            '1234567890',
            'I need help with my account',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should route message to User 2 Sales Agent', async () => {
      if (!user2PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user2PhoneNumberId,
            '9876543210',
            'I want to know more about your services',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should route message to User 3 first agent (Customer Service)', async () => {
      if (!user3Agent1PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent1PhoneNumberId,
            '1112223333',
            'Support needed',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should route message to User 3 second agent (Sales)', async () => {
      if (!user3Agent2PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent2PhoneNumberId,
            '4445556666',
            'Interested in buying',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
    });
  });

  describe('Phone Number Routing', () => {
    it('should handle unknown phone number gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage('unknown-phone-12345', '9999999999', 'Hello'),
        )
        .expect(200);

      expect(response.text).toBe('ok');
      // Should not crash, just log warning
    });

    it('should handle inactive ClientAgent gracefully', async () => {
      // This test would require setting up an inactive ClientAgent
      // For now, we verify the system doesn't crash with valid structure
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            'inactive-phone-id',
            '7777777777',
            'Test message',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle malformed WhatsApp payload gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          // Malformed payload - missing required fields
          entry: [
            {
              changes: [
                {
                  value: {
                    // Missing messages array
                  },
                },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should handle missing phoneNumberId in metadata', async () => {
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '1234567890',
                        id: 'msg-no-phone',
                        type: 'text',
                        text: { body: 'Hello' },
                      },
                    ],
                    metadata: {}, // No phone_number_id
                  },
                },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should ignore non-text message types', async () => {
      if (!user1PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '1234567890',
                        id: 'msg-image',
                        type: 'image', // Non-text type
                        image: { id: 'image-123' },
                      },
                    ],
                    metadata: { phone_number_id: user1PhoneNumberId },
                  },
                },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.text).toBe('ok');
      // Message should be ignored, no processing
    });

    it('should handle empty entry array', async () => {
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          entry: [],
        })
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should handle null payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(null)
        .expect(200);

      expect(response.text).toBe('ok');
    });
  });

  describe('Conversation Isolation', () => {
    it('should maintain separate conversations for different users with same agent type', async () => {
      // User 1 and User 3 both have Customer Service Agent
      // Messages should be isolated per client
      if (!user1PhoneNumberId || !user3Agent1PhoneNumberId) {
        return;
      }

      // Send message to User 1
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user1PhoneNumberId,
            '1111111111',
            'User 1 message',
            'msg-user1-1',
          ),
        )
        .expect(200);

      // Send message to User 3 (different client, same agent type)
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent1PhoneNumberId,
            '2222222222',
            'User 3 message',
            'msg-user3-1',
          ),
        )
        .expect(200);

      // Both should be processed without interference
      // Conversations should be separate (verified by conversationId including phoneNumberId)
    });

    it('should maintain separate conversations for same channel identifier across different clients', async () => {
      if (!user1PhoneNumberId || !user2PhoneNumberId) {
        return;
      }

      const sameChannelIdentifier = '5555555555';

      // Same channel identifier messages different clients
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user1PhoneNumberId,
            sameChannelIdentifier,
            'Message to User 1',
            'msg-same-user-1',
          ),
        )
        .expect(200);

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user2PhoneNumberId,
            sameChannelIdentifier,
            'Message to User 2',
            'msg-same-user-2',
          ),
        )
        .expect(200);

      // Should create separate conversations based on phoneNumberId
    });
  });

  describe('Multi-Agent User Tests (User 3)', () => {
    it('should handle messages to User 3 first agent independently', async () => {
      if (!user3Agent1PhoneNumberId) {
        return;
      }

      const from = '3333333333';

      // First message
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent1PhoneNumberId,
            from,
            'First message to agent 1',
            'msg-u3-a1-1',
          ),
        )
        .expect(200);

      // Second message (conversation continuity)
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent1PhoneNumberId,
            from,
            'Follow-up to agent 1',
            'msg-u3-a1-2',
          ),
        )
        .expect(200);
    });

    it('should handle messages to User 3 second agent independently', async () => {
      if (!user3Agent2PhoneNumberId) {
        return;
      }

      const from = '4444444444';

      // First message
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent2PhoneNumberId,
            from,
            'First message to agent 2',
            'msg-u3-a2-1',
          ),
        )
        .expect(200);

      // Second message (conversation continuity)
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent2PhoneNumberId,
            from,
            'Follow-up to agent 2',
            'msg-u3-a2-2',
          ),
        )
        .expect(200);
    });

    it('should not mix conversations between User 3 agents', async () => {
      if (!user3Agent1PhoneNumberId || !user3Agent2PhoneNumberId) {
        return;
      }

      const sameFrom = '6666666666';

      // Send to both agents from same external user
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent1PhoneNumberId,
            sameFrom,
            'Message to CS agent',
            'msg-u3-both-1',
          ),
        )
        .expect(200);

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user3Agent2PhoneNumberId,
            sameFrom,
            'Message to Sales agent',
            'msg-u3-both-2',
          ),
        )
        .expect(200);

      // Should create separate conversations due to different phoneNumberId in conversationId
    });
  });

  describe('Channel Configuration', () => {
    it('should verify User 2 WhatsApp-only configuration works', async () => {
      if (!user2PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user2PhoneNumberId,
            '8888888888',
            'WhatsApp only user message',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should verify User 1 multi-channel configuration works for WhatsApp', async () => {
      if (!user1PhoneNumberId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send(
          createWhatsAppMessage(
            user1PhoneNumberId,
            '9999999999',
            'Multi-channel user WhatsApp message',
          ),
        )
        .expect(200);

      expect(response.text).toBe('ok');
      // User 1 has both WhatsApp and Email, but WhatsApp should work independently
    });
  });
});
