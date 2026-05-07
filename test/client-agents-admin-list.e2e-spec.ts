import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('ClientAgents admin list (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  let testPersonalityId: Types.ObjectId;
  const createdPersonalityIds: Types.ObjectId[] = [];

  const createdClientIds: Types.ObjectId[] = [];
  const createdAgentIds: Types.ObjectId[] = [];
  const createdClientAgentIds: Types.ObjectId[] = [];

  const cleanup = async () => {
    if (!connection) return;

    if (createdClientAgentIds.length > 0) {
      await connection.collection('client_agents').deleteMany({
        _id: { $in: createdClientAgentIds },
      });
    }
    if (createdClientIds.length > 0) {
      await connection.collection('clients').deleteMany({
        _id: { $in: createdClientIds },
      });
    }
    if (createdAgentIds.length > 0) {
      await connection.collection('agents').deleteMany({
        _id: { $in: createdAgentIds },
      });
    }
    if (createdPersonalityIds.length > 0) {
      await connection.collection('personalities').deleteMany({
        _id: { $in: createdPersonalityIds },
      });
    }

    createdClientAgentIds.length = 0;
    createdClientIds.length = 0;
    createdAgentIds.length = 0;
    createdPersonalityIds.length = 0;
  };

  const seedClient = async (name: string): Promise<Types.ObjectId> => {
    const _id = new Types.ObjectId();
    createdClientIds.push(_id);
    await connection.collection('clients').insertOne({
      _id,
      name,
      type: 'individual',
      status: 'active',
      billingCurrency: 'USD',
      billingAnchor: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return _id;
  };

  const seedAgent = async (name: string): Promise<Types.ObjectId> => {
    const _id = new Types.ObjectId();
    createdAgentIds.push(_id);
    await connection.collection('agents').insertOne({
      _id,
      name,
      systemPrompt: 'You are a test assistant.',
      status: 'active',
      createdBySeeder: false,
      monthlyTokenQuota: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return _id;
  };

  const seedClientAgent = async (input: {
    clientId: Types.ObjectId;
    agentId: Types.ObjectId;
    personalityId: Types.ObjectId;
    status?: 'active' | 'inactive' | 'archived';
    extra?: Record<string, unknown>;
  }): Promise<Types.ObjectId> => {
    const _id = new Types.ObjectId();
    createdClientAgentIds.push(_id);
    await connection.collection('client_agents').insertOne({
      _id,
      clientId: input.clientId.toString(),
      agentId: input.agentId.toString(),
      personalityId: input.personalityId,
      status: input.status ?? 'active',
      agentPricing: { amount: 100, currency: 'USD', monthlyTokenQuota: null },
      billingAnchor: new Date(),
      channels: [
        {
          channelId: new Types.ObjectId(),
          provider: 'telegram',
          status: 'active',
          amount: 0,
          currency: 'USD',
          monthlyMessageQuota: null,
          telegramBotId: '999000111',
          telegramWebhookSecretHex: 'deadbeefshouldnotleak',
          credentials: { botToken: 'super-secret-should-not-leak' },
          webhookRegistration: {
            status: 'registered',
            attemptCount: 1,
            fingerprint: 'fp-should-not-leak',
          },
        },
      ],
      promptSupplement: 'should-not-leak-supplement',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(input.extra ?? {}),
    });
    return _id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    const personalityDoc = await connection
      .collection('personalities')
      .findOne({ status: 'active' });
    if (personalityDoc) {
      testPersonalityId = personalityDoc._id as Types.ObjectId;
    } else {
      const _id = new Types.ObjectId();
      await connection.collection('personalities').insertOne({
        _id,
        name: 'E2E AdminList Default',
        description: 'E2E test personality',
        promptTemplate: 'Be helpful.',
        status: 'active',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testPersonalityId = _id;
      createdPersonalityIds.push(_id);
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('GET /client-agents returns the pagination envelope with hydrated summaries', async () => {
    const clientA = await seedClient(`Admin E2E Client A ${Date.now()}`);
    const clientB = await seedClient(`Admin E2E Client B ${Date.now()}`);
    const agentX = await seedAgent(`Admin E2E Agent X ${Date.now()}`);
    const agentY = await seedAgent(`Admin E2E Agent Y ${Date.now()}`);

    await seedClientAgent({
      clientId: clientA,
      agentId: agentX,
      personalityId: testPersonalityId,
    });
    await seedClientAgent({
      clientId: clientA,
      agentId: agentY,
      personalityId: testPersonalityId,
    });
    await seedClientAgent({
      clientId: clientB,
      agentId: agentX,
      personalityId: testPersonalityId,
    });

    const response = await request(app.getHttpServer())
      .get('/client-agents')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 20,
        total: expect.any(Number),
        totalPages: expect.any(Number),
        items: expect.any(Array),
      }),
    );
    expect(response.body.total).toBeGreaterThanOrEqual(3);
    expect(response.body.items.length).toBeGreaterThanOrEqual(3);

    const item = response.body.items[0];
    expect(item).toHaveProperty('client');
    expect(item).toHaveProperty('agent');
    expect(item).toHaveProperty('personality');
  });

  it('GET /client-agents?status=active&limit=2&page=1 filters and pages', async () => {
    const clientA = await seedClient(`E2E ${Date.now()} A`);
    const agentX = await seedAgent(`E2E ${Date.now()} X`);
    const agentY = await seedAgent(`E2E ${Date.now()} Y`);
    const agentZ = await seedAgent(`E2E ${Date.now()} Z`);

    await seedClientAgent({
      clientId: clientA,
      agentId: agentX,
      personalityId: testPersonalityId,
    });
    await seedClientAgent({
      clientId: clientA,
      agentId: agentY,
      personalityId: testPersonalityId,
      status: 'inactive',
    });
    await seedClientAgent({
      clientId: clientA,
      agentId: agentZ,
      personalityId: testPersonalityId,
    });

    const response = await request(app.getHttpServer())
      .get(
        `/client-agents?status=active&limit=2&page=1&clientId=${clientA.toString()}`,
      )
      .expect(200);

    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(2);
    expect(response.body.items.length).toBeLessThanOrEqual(2);
    for (const item of response.body.items) {
      expect(item.status).toBe('active');
      expect(item.clientId).toBe(clientA.toString());
    }
  });

  it('rejects invalid query params with 400', async () => {
    await request(app.getHttpServer())
      .get('/client-agents?limit=101')
      .expect(400);

    await request(app.getHttpServer())
      .get('/client-agents?sort=foo')
      .expect(400);

    await request(app.getHttpServer())
      .get('/client-agents?personalityId=not-a-mongo-id')
      .expect(400);

    await request(app.getHttpServer())
      .get('/client-agents?pageSize=20')
      .expect(400);
  });

  it('response body never contains redacted keys at any nesting level', async () => {
    const clientA = await seedClient(`Redact E2E Client ${Date.now()}`);
    const agentX = await seedAgent(`Redact E2E Agent ${Date.now()}`);
    await seedClientAgent({
      clientId: clientA,
      agentId: agentX,
      personalityId: testPersonalityId,
    });

    const response = await request(app.getHttpServer())
      .get(`/client-agents?clientId=${clientA.toString()}`)
      .expect(200);

    const json = JSON.stringify(response.body);
    expect(json).not.toContain('super-secret-should-not-leak');
    expect(json).not.toContain('deadbeefshouldnotleak');
    expect(json).not.toContain('fp-should-not-leak');
    expect(json).not.toContain('should-not-leak-supplement');

    const collectKeys = (val: unknown, acc: Set<string>) => {
      if (Array.isArray(val)) {
        for (const v of val) collectKeys(v, acc);
      } else if (val && typeof val === 'object') {
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          acc.add(k);
          collectKeys(v, acc);
        }
      }
    };
    const keys = new Set<string>();
    collectKeys(response.body, keys);
    expect(keys.has('credentials')).toBe(false);
    expect(keys.has('telegramWebhookSecretHex')).toBe(false);
    expect(keys.has('fingerprint')).toBe(false);
    expect(keys.has('promptSupplement')).toBe(false);
  });

  it('rejects createdBefore < createdAfter with 400', async () => {
    await request(app.getHttpServer())
      .get(
        '/client-agents?createdAfter=2024-12-01T00:00:00.000Z&createdBefore=2024-01-01T00:00:00.000Z',
      )
      .expect(400);
  });
});
