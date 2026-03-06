import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('ClientAgents (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  const createdClientIds: Types.ObjectId[] = [];
  const createdAgentIds: string[] = [];
  const createdChannelIds: Types.ObjectId[] = [];
  const createdClientAgentIds: string[] = [];
  const createdPhoneNumberIds: string[] = [];

  const cleanup = async () => {
    if (!connection) {
      return;
    }

    if (createdClientAgentIds.length > 0) {
      await connection.collection('client_agents').deleteMany({
        _id: { $in: createdClientAgentIds.map((id) => new Types.ObjectId(id)) },
      });
    }

    if (createdPhoneNumberIds.length > 0) {
      await connection.collection('client_phones').deleteMany({
        phoneNumberId: { $in: createdPhoneNumberIds },
      });
    }

    if (createdClientIds.length > 0) {
      await connection.collection('clients').deleteMany({
        _id: { $in: createdClientIds },
      });
    }

    if (createdAgentIds.length > 0) {
      await connection.collection('agents').deleteMany({
        _id: { $in: createdAgentIds.map((id) => new Types.ObjectId(id)) },
      });
    }

    if (createdChannelIds.length > 0) {
      await connection.collection('channels').deleteMany({
        _id: { $in: createdChannelIds },
      });
    }

    createdClientIds.length = 0;
    createdAgentIds.length = 0;
    createdChannelIds.length = 0;
    createdClientAgentIds.length = 0;
    createdPhoneNumberIds.length = 0;
  };

  const createActiveClient = async (name: string): Promise<string> => {
    const clientId = new Types.ObjectId();
    createdClientIds.push(clientId);

    await connection.collection('clients').insertOne({
      _id: clientId,
      name,
      type: 'individual',
      status: 'active',
      billingCurrency: 'USD',
      billingAnchor: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return clientId.toString();
  };

  const createActiveAgent = async (name: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/agents')
      .send({
        name,
        systemPrompt: 'You are a test assistant.',
      })
      .expect(201);

    const agentId = response.body._id;
    createdAgentIds.push(agentId);

    await request(app.getHttpServer())
      .put(`/agents/${agentId}/prices/USD`)
      .send({ amount: 0 })
      .expect(200);

    return agentId;
  };

  const provisionChannel = async (
    name: string,
    type: 'whatsapp' | 'instagram' | 'web' | 'api' | 'tiktok',
    supportedProviders: string[],
  ): Promise<string> => {
    const channelId = new Types.ObjectId();
    createdChannelIds.push(channelId);

    await connection.collection('channels').insertOne({
      _id: channelId,
      name,
      type,
      supportedProviders,
    });

    const channelIdStr = channelId.toString();
    await request(app.getHttpServer())
      .put(`/channels/${channelIdStr}/prices/USD`)
      .send({ amount: 0 })
      .expect(200);

    return channelIdStr;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('should create client-agent with valid channel configuration', async () => {
    const suffix = Date.now();
    const clientId = await createActiveClient(`CA E2E Client ${suffix}`);
    const agentId = await createActiveAgent(`CA E2E Agent ${suffix}`);
    const channelId = await provisionChannel(
      `CA E2E Instagram Channel ${suffix}`,
      'instagram',
      ['instagram'],
    );

    const response = await request(app.getHttpServer())
      .post('/client-agents')
      .send({
        clientId,
        agentId,
        price: 149,
        channels: [
          {
            channelId,
            provider: 'instagram',
            credentials: {
              instagramAccountId: `1784140000000${suffix}`,
              accessToken: 'ig-token',
            },
            llmConfig: {
              provider: 'openai',
              apiKey: 'test-key',
              model: 'gpt-4o',
            },
          },
        ],
      })
      .expect(201);

    createdClientAgentIds.push(response.body._id);

    const saved = await connection.collection('client_agents').findOne({
      _id: new Types.ObjectId(response.body._id),
    });

    expect(saved).toBeDefined();
    expect(saved?.channels).toHaveLength(1);
    expect(saved?.channels[0].channelId.toString()).toBe(channelId);
    expect(saved?.channels[0].provider).toBe('instagram');
    expect(saved?.channels[0].instagramAccountId).toBe(
      `1784140000000${suffix}`,
    );
  });

  it('should return 400 when no channels are provided', async () => {
    const suffix = Date.now();
    const clientId = await createActiveClient(`CA E2E Client ${suffix}`);
    const agentId = await createActiveAgent(`CA E2E Agent ${suffix}`);

    const response = await request(app.getHttpServer())
      .post('/client-agents')
      .send({
        clientId,
        agentId,
        price: 100,
        channels: [],
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('channels')]),
    );
  });

  it('should return 400 for duplicate channel IDs in request', async () => {
    const suffix = Date.now();
    const clientId = await createActiveClient(`CA E2E Client ${suffix}`);
    const agentId = await createActiveAgent(`CA E2E Agent ${suffix}`);
    const channelId = await provisionChannel(
      `CA E2E Web Channel ${suffix}`,
      'web',
      ['instagram'],
    );

    const response = await request(app.getHttpServer())
      .post('/client-agents')
      .send({
        clientId,
        agentId,
        price: 100,
        channels: [
          {
            channelId,
            provider: 'instagram',
            credentials: {},
            llmConfig: {
              provider: 'openai',
              apiKey: 'key',
              model: 'gpt-4o',
            },
          },
          {
            channelId,
            provider: 'instagram',
            credentials: {},
            llmConfig: {
              provider: 'openai',
              apiKey: 'key',
              model: 'gpt-4o',
            },
          },
        ],
      })
      .expect(400);

    expect(response.body.message).toContain('Duplicate channelId in request');
  });

  it('should return 400 when provider is not supported by channel', async () => {
    const suffix = Date.now();
    const clientId = await createActiveClient(`CA E2E Client ${suffix}`);
    const agentId = await createActiveAgent(`CA E2E Agent ${suffix}`);
    const channelId = await provisionChannel(
      `CA E2E Instagram Channel ${suffix}`,
      'instagram',
      ['meta'],
    );

    const response = await request(app.getHttpServer())
      .post('/client-agents')
      .send({
        clientId,
        agentId,
        price: 100,
        channels: [
          {
            channelId,
            provider: 'instagram',
            credentials: {},
            llmConfig: {
              provider: 'openai',
              apiKey: 'key',
              model: 'gpt-4o',
            },
          },
        ],
      })
      .expect(400);

    expect(response.body.message).toContain('is not supported by channel');
  });

  it('should return 409 when phoneNumberId is already owned by another client', async () => {
    const suffix = Date.now();
    const phoneNumberId = `ca-e2e-phone-${suffix}`;

    const clientAId = await createActiveClient(`CA E2E Client A ${suffix}`);
    const clientBId = await createActiveClient(`CA E2E Client B ${suffix}`);
    const agentId = await createActiveAgent(`CA E2E Agent ${suffix}`);
    const channelId = await provisionChannel(
      `CA E2E WhatsApp Channel ${suffix}`,
      'whatsapp',
      ['meta'],
    );

    createdPhoneNumberIds.push(phoneNumberId);

    const firstResponse = await request(app.getHttpServer())
      .post('/client-agents')
      .send({
        clientId: clientAId,
        agentId,
        price: 100,
        channels: [
          {
            channelId,
            provider: 'meta',
            credentials: {
              phoneNumberId,
              accessToken: 'token-a',
            },
            llmConfig: {
              provider: 'openai',
              apiKey: 'key-a',
              model: 'gpt-4o',
            },
          },
        ],
      })
      .expect(201);

    createdClientAgentIds.push(firstResponse.body._id);

    const secondResponse = await request(app.getHttpServer())
      .post('/client-agents')
      .send({
        clientId: clientBId,
        agentId,
        price: 100,
        channels: [
          {
            channelId,
            provider: 'meta',
            credentials: {
              phoneNumberId,
              accessToken: 'token-b',
            },
            llmConfig: {
              provider: 'openai',
              apiKey: 'key-b',
              model: 'gpt-4o',
            },
          },
        ],
      })
      .expect(409);

    expect(secondResponse.body.message).toContain(
      'already owned by another client',
    );
  });
});
