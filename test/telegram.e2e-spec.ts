import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AgentService } from '../src/core/agent/agent.service';
import * as request from 'supertest';
import { ChannelProvider } from '../src/core/domain/channels/channel-provider.enum';
import { deriveTelegramWebhookSecret } from '../src/shared/telegram-webhook-secret.util';

describe('Telegram Channel (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mockAgentService: Partial<AgentService>;
  let fetchSpy: jest.SpyInstance;

  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const telegramChannelIdObj = new Types.ObjectId();
  const telegramChannelName = `E2E Telegram Channel ${telegramChannelIdObj.toString()}`;

  const telegramBotId = '876543210';
  const botToken = `${telegramBotId}:abcdefghijklmnopqrstuvwxyz0123456789ABCDE`;

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

    mockAgentService = {
      run: jest.fn().mockImplementation(async () => {
        return {
          reply: {
            type: 'text',
            text: `Reply to telegram message`,
          },
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
        .deleteMany({ _id: { $in: [telegramChannelIdObj] } });
    }

    await connection.collection('channels').insertOne({
      _id: telegramChannelIdObj,
      name: telegramChannelName,
      type: 'telegram',
      supportedProviders: [ChannelProvider.Telegram],
    });

    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'Telegram Test Client',
      type: 'individual',
      status: 'active',
      billingCurrency: 'USD',
      billingAnchor: new Date(),
    });

    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'Telegram Test Agent',
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
          channelId: telegramChannelIdObj,
          provider: ChannelProvider.Telegram,
          status: 'active',
          telegramBotId,
          credentials: {
            botToken,
          },
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
        .deleteMany({ _id: { $in: [telegramChannelIdObj] } });
      await connection
        .collection('processed_events')
        .deleteMany({ channel: 'telegram' });
    }
    await app.close();
    fetchSpy.mockRestore();
  });

  beforeEach(async () => {
    await connection
      .collection('processed_events')
      .deleteMany({ channel: 'telegram' });
    jest.clearAllMocks();
  });

  it('should process valid Telegram webhook message and send reply', async () => {
    const fetchCallsBefore = fetchSpy.mock.calls.length;
    const secret = deriveTelegramWebhookSecret(botToken);

    await request(app.getHttpServer())
      .post(`/telegram/webhook/${telegramBotId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', secret)
      .send({
        update_id: 1,
        message: {
          message_id: 100,
          chat: { id: 424242, type: 'private' },
          from: { id: 111222333, is_bot: false, first_name: 'T' },
          text: 'Hello Telegram',
        },
      })
      .expect(200)
      .expect('ok');

    await waitForMockCalls(mockAgentService.run as jest.Mock, 1);

    expect(mockAgentService.run).toHaveBeenCalledTimes(1);
    const runArgs = (mockAgentService.run as jest.Mock).mock.calls[0][0];
    expect(runArgs.channel).toBe('telegram');
    expect(runArgs.message.text).toBe('Hello Telegram');

    await waitForSpyCalls(fetchSpy, fetchCallsBefore + 1);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/api\.telegram\.org\/bot.*\/sendMessage/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('Reply to telegram message'),
      }),
    );
  });

  it('should reject webhook when secret header is wrong', async () => {
    const callsBefore = (mockAgentService.run as jest.Mock).mock.calls.length;

    await request(app.getHttpServer())
      .post(`/telegram/webhook/${telegramBotId}`)
      .set('X-Telegram-Bot-Api-Secret-Token', 'deadbeef')
      .send({
        update_id: 2,
        message: {
          message_id: 101,
          chat: { id: 1, type: 'private' },
          from: { id: 111222333, is_bot: false, first_name: 'T' },
          text: 'nope',
        },
      })
      .expect(200)
      .expect('ok');

    await new Promise((r) => setTimeout(r, 300));
    expect((mockAgentService.run as jest.Mock).mock.calls.length).toBe(
      callsBefore,
    );
  });
});
