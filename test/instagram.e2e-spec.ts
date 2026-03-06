import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AgentService } from '../src/core/agent/agent.service';
import * as request from 'supertest';
import { ChannelProvider } from '../src/core/domain/channels/channel-provider.enum';

describe('Instagram Channel (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mockAgentService: Partial<AgentService>;
  let fetchSpy: jest.SpyInstance;

  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const instagramChannelIdObj = new Types.ObjectId();
  const instagramChannelName = `E2E Instagram Channel ${instagramChannelIdObj.toString()}`;

  const instagramAccountId = '17841400000000000';
  const senderId = 'igsid_sender_123';
  const validAccessToken = 'valid-instagram-access-token';

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
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
      json: jest.fn().mockResolvedValue({}),
    } as any);

    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'ig-verify-token';
    delete process.env.INSTAGRAM_APP_SECRET;

    mockAgentService = {
      run: jest.fn().mockImplementation(async (input) => {
        return {
          reply: {
            type: 'text',
            text: `Reply to instagram message`,
          },
          conversationId: input.conversationId,
          usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AgentService)
      .useValue(mockAgentService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

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
        .deleteMany({ _id: { $in: [instagramChannelIdObj] } });
    }

    await connection.collection('channels').insertOne({
      _id: instagramChannelIdObj,
      name: instagramChannelName,
      type: 'instagram',
      supportedProviders: [ChannelProvider.Instagram],
    });

    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'Instagram Test Client',
      type: 'individual',
      status: 'active',
      billingCurrency: 'USD',
      billingAnchor: new Date(),
    });

    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'Instagram Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    });

    await connection.collection('client_agents').insertOne({
      _id: clientAgentIdObj,
      clientId: clientId as any,
      agentId: agentId as any,
      price: 0,
      status: 'active',
      channels: [
        {
          channelId: instagramChannelIdObj,
          provider: ChannelProvider.Instagram,
          status: 'active',
          instagramAccountId,
          credentials: {
            instagramAccountId,
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
        .deleteMany({ _id: { $in: [instagramChannelIdObj] } });
      await connection
        .collection('processed_events')
        .deleteMany({ channel: 'instagram' });
    }
    await app.close();
    fetchSpy.mockRestore();
    delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  });

  beforeEach(async () => {
    await connection
      .collection('processed_events')
      .deleteMany({ channel: 'instagram' });
    jest.clearAllMocks();
  });

  it('should verify webhook challenge', async () => {
    await request(app.getHttpServer())
      .get('/instagram/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'ig-verify-token',
        'hub.challenge': 'challenge_ig',
      })
      .expect(200)
      .expect('challenge_ig');
  });

  it('should process valid Instagram webhook message and send reply', async () => {
    await request(app.getHttpServer())
      .post('/instagram/webhook')
      .send({
        object: 'instagram',
        entry: [
          {
            messaging: [
              {
                sender: { id: senderId },
                recipient: { id: instagramAccountId },
                timestamp: Date.now(),
                message: {
                  mid: 'mid_1',
                  text: 'Hello Instagram',
                },
              },
            ],
          },
        ],
      })
      .expect(200)
      .expect('ok');

    await waitForMockCalls(mockAgentService.run as jest.Mock, 1);

    expect(mockAgentService.run).toHaveBeenCalledTimes(1);
    const runArgs = (mockAgentService.run as jest.Mock).mock.calls[0][0];
    expect(runArgs.channel).toBe('instagram');
    expect(runArgs.message.text).toBe('Hello Instagram');

    await waitForSpyCalls(fetchSpy, 1);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/me/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${validAccessToken}`,
        }),
        body: expect.stringContaining('Reply to instagram message'),
      }),
    );
  });

  it('should ignore unknown instagram account id', async () => {
    const callsBeforeRequest = (mockAgentService.run as jest.Mock).mock.calls
      .length;

    await request(app.getHttpServer())
      .post('/instagram/webhook')
      .send({
        object: 'instagram',
        entry: [
          {
            messaging: [
              {
                sender: { id: senderId },
                recipient: { id: '17840000000000000' },
                timestamp: Date.now(),
                message: {
                  mid: 'mid_2',
                  text: 'Hello unknown account',
                },
              },
            ],
          },
        ],
      })
      .expect(200)
      .expect('ok');

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect((mockAgentService.run as jest.Mock).mock.calls.length).toBe(
      callsBeforeRequest,
    );
  });
});
