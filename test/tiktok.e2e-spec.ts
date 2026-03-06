import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AgentService } from '../src/core/agent/agent.service';
import * as request from 'supertest';
import { ChannelProvider } from '../src/core/domain/channels/channel-provider.enum';

describe('TikTok Channel (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mockAgentService: Partial<AgentService>;
  let fetchSpy: jest.SpyInstance;

  // IDs for setup
  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const tiktokChannelIdObj = new Types.ObjectId();
  const tiktokChannelName = `E2E TikTok Channel ${tiktokChannelIdObj.toString()}`;

  // Valid Channels Config
  const validTiktokUserId = 'tiktok-user-123';
  const senderUserId = 'sender-456';
  const validAccessToken = 'valid-access-token';

  const waitForMockCalls = async (
    mockFn: jest.Mock,
    expectedCalls: number,
    timeoutMs = 5000,
  ): Promise<void> => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (mockFn.mock.calls.length >= expectedCalls) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  const waitForSpyCalls = async (
    spy: jest.SpyInstance,
    expectedCalls: number,
    timeoutMs = 5000,
  ): Promise<void> => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (spy.mock.calls.length >= expectedCalls) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  beforeAll(async () => {
    // 1. Mock global fetch
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
      json: jest.fn().mockResolvedValue({}),
    } as any);

    // 2. Setup AgentService Mock
    mockAgentService = {
      run: jest.fn().mockImplementation(async (input) => {
        return {
          reply: {
            type: 'text',
            text: `Reply to tiktok message`,
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

    connection = moduleFixture.get<Connection>(getConnectionToken());

    // 4. Seed Database
    if (connection) {
      await connection
        .collection('client_agents')
        .deleteMany({ _id: { $in: [clientAgentIdObj] } });
      await connection
        .collection('clients')
        .deleteMany({ _id: { $in: [clientIdObj] } });
      await connection
        .collection('agents')
        .deleteMany({ _id: { $in: [agentIdObj] } });
      await connection
        .collection('channels')
        .deleteMany({ _id: { $in: [tiktokChannelIdObj] } });
    }

    await connection.collection('channels').insertOne({
      _id: tiktokChannelIdObj,
      name: tiktokChannelName,
      type: 'tiktok',
      supportedProviders: [ChannelProvider.Tiktok],
    });

    // Create Client (billingAnchor required for orchestrator to process messages)
    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'TikTok Test Client',
      type: 'individual',
      status: 'active',
      billingCurrency: 'USD',
      billingAnchor: new Date(),
    });

    // Create Agent
    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'TikTok Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    });

    // Create ClientAgent
    await connection.collection('client_agents').insertOne({
      _id: clientAgentIdObj,
      clientId: clientId as any,
      agentId: agentId as any,
      price: 0,
      status: 'active',
      channels: [
        {
          channelId: tiktokChannelIdObj,
          provider: ChannelProvider.Tiktok,
          status: 'active',
          tiktokUserId: validTiktokUserId,
          credentials: {
            tiktokUserId: validTiktokUserId,
            accessToken: validAccessToken,
          },
          llmConfig: { provider: 'openai', model: 'gpt-4', apiKey: 'test-key' },
        },
      ],
    });
  });

  afterAll(async () => {
    if (connection) {
      await connection
        .collection('client_agents')
        .deleteMany({ _id: { $in: [clientAgentIdObj] } });
      await connection
        .collection('clients')
        .deleteMany({ _id: { $in: [clientIdObj] } });
      await connection
        .collection('agents')
        .deleteMany({ _id: { $in: [agentIdObj] } });
      await connection
        .collection('channels')
        .deleteMany({ _id: { $in: [tiktokChannelIdObj] } });
      await connection
        .collection('processed_events')
        .deleteMany({ channel: 'tiktok' });
    }
    await app.close();
    fetchSpy.mockRestore();
  });

  beforeEach(async () => {
    await connection
      .collection('processed_events')
      .deleteMany({ channel: 'tiktok' });
    jest.clearAllMocks();
  });

  it('should process valid TikTok webhook message and send reply', async () => {
    const fetchCallsBeforeRequest = fetchSpy.mock.calls.length;

    // Act
    await request(app.getHttpServer())
      .post('/tiktok/webhook')
      .send({
        event: 'message.received',
        data: {
          message: {
            type: 'text',
            text: 'Hello TikTok',
          },
          recipient: {
            user_id: validTiktokUserId,
          },
          sender: {
            user_id: senderUserId,
            username: 'user_sender',
          },
          conversation_id: 'conv_123',
          message_id: 'msg_123',
        },
      })
      .expect(200);

    await waitForMockCalls(mockAgentService.run as jest.Mock, 1);

    // Assert
    // Check Agent Service Calls
    expect(mockAgentService.run).toHaveBeenCalledTimes(1);
    const runArgs = (mockAgentService.run as jest.Mock).mock.calls[0][0];
    expect(runArgs.channel).toBe('tiktok');
    expect(runArgs.message.text).toBe('Hello TikTok');

    await waitForSpyCalls(fetchSpy, fetchCallsBeforeRequest + 1);

    // Verify Outgoing Reply (Reply logic calls fetch)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/message/send/'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${validAccessToken}`,
        }),
        body: expect.stringContaining('Reply to tiktok message'),
      }),
    );
  });

  it('should handle message for unregistered user (ignore)', async () => {
    const callsBeforeRequest = (mockAgentService.run as jest.Mock).mock.calls
      .length;
    const fetchCallsBeforeRequest = fetchSpy.mock.calls.length;

    // Act
    await request(app.getHttpServer())
      .post('/tiktok/webhook')
      .send({
        event: 'message.received',
        data: {
          message: {
            type: 'text',
            text: 'Who dis?',
          },
          recipient: {
            user_id: 'unknown_user_id',
          },
          sender: {
            user_id: senderUserId,
          },
          conversation_id: 'conv_456',
          message_id: 'msg_456',
        },
      })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Assert
    expect((mockAgentService.run as jest.Mock).mock.calls.length).toBe(
      callsBeforeRequest,
    );
    expect(fetchSpy.mock.calls.length).toBe(fetchCallsBeforeRequest);
  });
});
