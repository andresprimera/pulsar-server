import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AgentService } from '../src/agent/agent.service';
import { ChannelProvider } from '../src/channels/channel-provider.enum';
import * as request from 'supertest';

describe('Concurrent Channels (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mockAgentService: Partial<AgentService>;
  let fetchSpy: jest.SpyInstance;

  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();

  const whatsappChannelIdObj = new Types.ObjectId();
  const tiktokChannelIdObj = new Types.ObjectId();
  const instagramChannelIdObj = new Types.ObjectId();

  const phoneNumberId = 'valid-phone-123';
  const tiktokRecipientId = 'tiktok-recipient-123';
  const instagramAccountId = '17841400000000000';

  beforeAll(async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
      json: jest.fn().mockResolvedValue({}),
    } as any);

    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'ig-verify-token';

    mockAgentService = {
      run: jest.fn().mockImplementation(async (input) => {
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
      await connection.collection('channels').deleteMany({
        _id: { $in: [whatsappChannelIdObj, tiktokChannelIdObj, instagramChannelIdObj] },
      });
    }

    await connection.collection('channels').insertMany([
      {
        _id: whatsappChannelIdObj,
        name: 'E2E Concurrent WhatsApp Channel',
        type: 'whatsapp',
        supportedProviders: [ChannelProvider.Meta],
      },
      {
        _id: tiktokChannelIdObj,
        name: 'E2E Concurrent TikTok Channel',
        type: 'tiktok',
        supportedProviders: [ChannelProvider.Tiktok],
      },
      {
        _id: instagramChannelIdObj,
        name: 'E2E Concurrent Instagram Channel',
        type: 'instagram',
        supportedProviders: [ChannelProvider.Instagram],
      },
    ]);

    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'Concurrent Test Client',
      type: 'individual',
      status: 'active',
    });

    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'Concurrent Test Agent',
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
          channelId: whatsappChannelIdObj,
          provider: ChannelProvider.Meta,
          status: 'active',
          phoneNumberId,
          credentials: {
            phoneNumberId,
            accessToken: 'wa-token',
          },
          llmConfig: { provider: 'openai', model: 'gpt-4', apiKey: 'test-key' },
        },
        {
          channelId: tiktokChannelIdObj,
          provider: ChannelProvider.Tiktok,
          status: 'active',
          tiktokUserId: tiktokRecipientId,
          credentials: {
            tiktokUserId: tiktokRecipientId,
            accessToken: 'tt-token',
          },
          llmConfig: { provider: 'openai', model: 'gpt-4', apiKey: 'test-key' },
        },
        {
          channelId: instagramChannelIdObj,
          provider: ChannelProvider.Instagram,
          status: 'active',
          instagramAccountId,
          credentials: {
            instagramAccountId,
            accessToken: 'ig-token',
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
      await connection.collection('channels').deleteMany({
        _id: { $in: [whatsappChannelIdObj, tiktokChannelIdObj, instagramChannelIdObj] },
      });
    }
    await app.close();
    fetchSpy.mockRestore();
    delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process concurrent inbound events for WhatsApp, TikTok, and Instagram', async () => {
    const wa = request(app.getHttpServer())
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
                      id: 'msg-wa-1',
                      type: 'text',
                      text: { body: 'Hello from WhatsApp' },
                    },
                  ],
                  metadata: { phone_number_id: phoneNumberId },
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    const tt = request(app.getHttpServer())
      .post('/tiktok/webhook')
      .send({
        event: 'message.received',
        data: {
          message: { type: 'text', text: 'Hello from TikTok' },
          recipient: { user_id: tiktokRecipientId },
          sender: { user_id: 'tt-sender-1', username: 'tt-user' },
          conversation_id: 'tt-conv-1',
          message_id: 'tt-msg-1',
        },
      })
      .expect(200);

    const ig = request(app.getHttpServer())
      .post('/instagram/webhook')
      .send({
        object: 'instagram',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'ig-sender-1' },
                recipient: { id: instagramAccountId },
                timestamp: Date.now(),
                message: {
                  mid: 'ig-mid-1',
                  text: 'Hello from Instagram',
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    await Promise.all([wa, tt, ig]);

    expect(mockAgentService.run).toHaveBeenCalledTimes(3);
    const channels = (mockAgentService.run as jest.Mock).mock.calls
      .map((call) => call[0].channel)
      .sort();

    expect(channels).toEqual(['instagram', 'tiktok', 'whatsapp']);
  });

  it('should ignore unknown channel identifiers', async () => {
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
                      from: '1234567890',
                      id: 'msg-wa-unknown',
                      type: 'text',
                      text: { body: 'Who dis?' },
                    },
                  ],
                  metadata: { phone_number_id: 'unknown-phone-id' },
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/tiktok/webhook')
      .send({
        event: 'message.received',
        data: {
          message: { type: 'text', text: 'Who dis?' },
          recipient: { user_id: 'unknown-tt-recipient' },
          sender: { user_id: 'tt-sender-unknown', username: 'tt-user' },
          conversation_id: 'tt-conv-unknown',
          message_id: 'tt-msg-unknown',
        },
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/instagram/webhook')
      .send({
        object: 'instagram',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'ig-sender-unknown' },
                recipient: { id: '17840000000000000' },
                timestamp: Date.now(),
                message: {
                  mid: 'ig-mid-unknown',
                  text: 'Who dis?',
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    expect(mockAgentService.run).not.toHaveBeenCalled();
  });

  it('should enforce provider coverage for active channels', () => {
    const coveredProviders = [
      ChannelProvider.Meta,
      ChannelProvider.Tiktok,
      ChannelProvider.Instagram,
    ];

    const knownUntestedProviders = [ChannelProvider.Twilio];

    const allProviders = Object.values(ChannelProvider);
    const missing = allProviders.filter(
      (provider) =>
        !coveredProviders.includes(provider) &&
        !knownUntestedProviders.includes(provider),
    );

    if (missing.length > 0) {
      throw new Error(
        `The following ChannelProviders are not covered by E2E tests: ${missing.join(
          ', ',
        )}. Please add tests for them in 'concurrent-channels.e2e-spec.ts' or explicitly mark them as untested inside the test file.`,
      );
    }
  });
});
