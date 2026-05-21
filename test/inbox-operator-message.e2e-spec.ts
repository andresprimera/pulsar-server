import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppModule } from '../src/app.module';
import { MessagingGatewayService } from '../src/core/channels/gateway/messaging-gateway.service';
import { ClientSessionsService } from '../src/features/client-auth/client-sessions.service';
import { CLIENT_SESSION_COOKIE_NAME } from '../src/features/client-auth/client-session-cookie-options';

/**
 * Controller-level e2e for `POST /inbox/conversations/:conversationId/messages`.
 *
 * Approach: seed `client`, `user`, `agent`, `channel`, `client_agent`,
 * `contact`, `conversation` directly via the Mongo connection, then mint a
 * client session via `ClientSessionsService.issue(...)` so requests carry
 * a real `pulsar_client_session` cookie. `MessagingGatewayService` is
 * mocked at the provider level so no real provider HTTP is attempted.
 *
 * Coverage:
 *  - 201 happy path (human-mode conversation, valid `Idempotency-Key`).
 *  - 409 `BOT_AUTOPILOT_ACTIVE` body shape on a bot-mode conversation.
 *  - 404 cross-tenant (conversation belongs to a different client).
 *  - 400 missing `Idempotency-Key` header.
 *  - 400 malformed UUID in `Idempotency-Key`.
 *  - 400 header longer than 64 chars.
 *  - 400 invalid `:conversationId` (not a valid ObjectId).
 *  - 502 on gateway throw; subsequent GET on messages shows the failed
 *    row; subsequent GET on conversations shows the conversation bubbled
 *    up (touch fires on failure too).
 *  - Idempotency replay: same key, same conversation → same `_id` with
 *    201, and `MessagingGatewayService.send` invoked exactly once across
 *    the two requests.
 */
describe('Inbox operator-message endpoint (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mockGateway: { send: jest.Mock };

  // Tenant A (caller)
  const clientAObj = new Types.ObjectId();
  const userAObj = new Types.ObjectId();
  const userAEmail = `e2e-operator-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;

  // Tenant B (foreign — used for the 404 cross-tenant check)
  const clientBObj = new Types.ObjectId();

  const agentObj = new Types.ObjectId();
  const channelObj = new Types.ObjectId();
  const clientAgentObj = new Types.ObjectId();

  // One contact per conversation: the live database carries a unique
  // partial index `conv_per_kind_unique_open_v2` on
  // `(clientId, contactId, channelId, agentKind)`, so two open
  // conversations with the same tuple collide. Using distinct contacts
  // sidesteps the constraint without changing what the e2e is testing.
  const contactA1Obj = new Types.ObjectId();
  const contactA2Obj = new Types.ObjectId();
  const contactBObj = new Types.ObjectId();

  // Three conversations: human-mode (A), bot-mode (A), foreign (B).
  const humanConvObj = new Types.ObjectId();
  const botConvObj = new Types.ObjectId();
  const foreignConvObj = new Types.ObjectId();

  let sessionCookie: string;

  const VALID_UUID_V4 = (): string =>
    // Build a syntactically valid UUID v4 deterministically per call.
    [
      Math.random().toString(16).slice(2, 10).padEnd(8, '0').slice(0, 8),
      Math.random().toString(16).slice(2, 6).padEnd(4, '0').slice(0, 4),
      '4' + Math.random().toString(16).slice(2, 5).padEnd(3, '0').slice(0, 3),
      // First nibble must be 8/9/a/b for UUID v4.
      ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)] +
        Math.random().toString(16).slice(2, 5).padEnd(3, '0').slice(0, 3),
      Math.random().toString(16).slice(2, 14).padEnd(12, '0').slice(0, 12),
    ].join('-');

  const cleanup = async (): Promise<void> => {
    if (!connection) return;
    await connection
      .collection('messages')
      .deleteMany({ channelId: channelObj });
    await connection.collection('conversations').deleteMany({
      _id: { $in: [humanConvObj, botConvObj, foreignConvObj] },
    });
    await connection
      .collection('contacts')
      .deleteMany({ _id: { $in: [contactA1Obj, contactA2Obj, contactBObj] } });
    await connection
      .collection('client_agents')
      .deleteMany({ _id: clientAgentObj });
    await connection.collection('agents').deleteMany({ _id: agentObj });
    await connection.collection('channels').deleteMany({ _id: channelObj });
    await connection
      .collection('clients')
      .deleteMany({ _id: { $in: [clientAObj, clientBObj] } });
    await connection.collection('users').deleteMany({ _id: userAObj });
    await connection
      .collection('client_user_sessions')
      .deleteMany({ userId: userAObj });
  };

  const reseedConversations = async (): Promise<void> => {
    // Wipe conversations + messages between tests so each scenario starts
    // from a known control-mode and an empty thread.
    await connection
      .collection('messages')
      .deleteMany({ channelId: channelObj });
    await connection.collection('conversations').deleteMany({
      _id: { $in: [humanConvObj, botConvObj, foreignConvObj] },
    });

    // Seed in the recent past so the test can assert that touch (which
    // uses `new Date()`) advances `lastMessageAt` strictly past the
    // seeded value. Using a fixed wall-clock value in the future would
    // make this comparison flaky depending on when the test runs.
    const seededAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const now = seededAt;

    await connection.collection('conversations').insertMany([
      {
        _id: humanConvObj,
        clientId: clientAObj,
        contactId: contactA1Obj,
        channelId: channelObj,
        clientAgentId: clientAgentObj,
        status: 'open',
        controlMode: 'human',
        lastMessageAt: now,
        lastMessagePreview: 'inbound preview',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: botConvObj,
        clientId: clientAObj,
        contactId: contactA2Obj,
        channelId: channelObj,
        clientAgentId: clientAgentObj,
        status: 'open',
        controlMode: 'bot',
        lastMessageAt: now,
        lastMessagePreview: 'bot preview',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: foreignConvObj,
        clientId: clientBObj,
        contactId: contactBObj,
        channelId: channelObj,
        clientAgentId: clientAgentObj,
        status: 'open',
        controlMode: 'human',
        lastMessageAt: now,
        lastMessagePreview: 'foreign preview',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  beforeAll(async () => {
    mockGateway = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MessagingGatewayService)
      .useValue(mockGateway)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    await cleanup();

    // Seed clients (tenant A is the caller; tenant B owns the foreign
    // conversation used for the cross-tenant 404 check).
    await connection.collection('clients').insertMany([
      {
        _id: clientAObj,
        name: 'E2E Operator Tenant A',
        type: 'individual',
        status: 'active',
        billingCurrency: 'USD',
        billingAnchor: new Date(),
      },
      {
        _id: clientBObj,
        name: 'E2E Operator Tenant B (foreign)',
        type: 'individual',
        status: 'active',
        billingCurrency: 'USD',
        billingAnchor: new Date(),
      },
    ]);

    // Seed the channel (whatsapp — happens to be the easiest because its
    // adapter is already registered, but we mock `MessagingGatewayService`
    // anyway so transport never runs).
    await connection.collection('channels').insertOne({
      _id: channelObj,
      name: `e2e-operator-channel-${channelObj.toString()}`,
      type: 'whatsapp',
      supportedProviders: ['meta'],
    });

    // Seed the agent + hire (client A is the only hiring tenant).
    await connection.collection('agents').insertOne({
      _id: agentObj,
      name: 'E2E Operator Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    });

    await connection.collection('client_agents').insertOne({
      _id: clientAgentObj,
      clientId: clientAObj.toString(),
      agentId: agentObj.toString(),
      price: 0,
      status: 'active',
      channels: [
        {
          channelId: channelObj,
          provider: 'meta',
          status: 'active',
          phoneNumberId: 'e2e-operator-phone',
          credentials: { phoneNumberId: 'e2e-operator-phone' },
          amount: 0,
          currency: 'USD',
          monthlyMessageQuota: null,
        },
      ],
    });

    // Seed contacts. Two contacts for tenant A (one per conversation —
    // see the `agentKind`/contact-uniqueness comment above) and one for
    // tenant B used in the cross-tenant 404 check.
    await connection.collection('contacts').insertMany([
      {
        _id: contactA1Obj,
        externalId: '1234567890',
        identifier: { type: 'phone', value: '+1234567890' },
        clientId: clientAObj,
        channelId: channelObj,
        name: 'Contact A1 (human-mode)',
        metadata: {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: contactA2Obj,
        externalId: '1234567891',
        identifier: { type: 'phone', value: '+1234567891' },
        clientId: clientAObj,
        channelId: channelObj,
        name: 'Contact A2 (bot-mode)',
        metadata: {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: contactBObj,
        externalId: '0987654321',
        identifier: { type: 'phone', value: '+0987654321' },
        clientId: clientBObj,
        channelId: channelObj,
        name: 'Contact B (foreign)',
        metadata: {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Seed the operator user (tenant A).
    await connection.collection('users').insertOne({
      _id: userAObj,
      email: userAEmail,
      name: 'Maria Q.',
      clientId: clientAObj,
      status: 'active',
      clientRole: 'operator',
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Mint a session directly (skip the password-login dance — we only
    // need a valid cookie).
    const sessionsService = moduleFixture.get(ClientSessionsService);
    const issued = await sessionsService.issue({
      userId: userAObj,
      clientId: clientAObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    sessionCookie = `${CLIENT_SESSION_COOKIE_NAME}=${issued.rawToken}`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await reseedConversations();
    mockGateway.send.mockReset();
    mockGateway.send.mockResolvedValue(undefined);
  });

  describe('happy path (201)', () => {
    it('persists the operator message and returns the wire shape', async () => {
      const idempotencyKey = VALID_UUID_V4();

      const response = await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text: 'Hi, thanks for reaching out!' })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          _id: expect.any(String),
          conversationId: humanConvObj.toString(),
          content: 'Hi, thanks for reaching out!',
          type: 'human',
          sender: 'human',
          authorName: 'Maria Q.',
          deliveryStatus: 'sent',
        }),
      );

      // Gateway was hit exactly once (no replay shortcut on first call).
      expect(mockGateway.send).toHaveBeenCalledTimes(1);

      // Persisted row carries the operator's user id (verify via DB).
      const persisted = await connection
        .collection('messages')
        .findOne({ _id: new Types.ObjectId(response.body._id) });
      if (persisted === null) {
        throw new Error('Expected persisted message row to exist');
      }
      expect(persisted.type).toBe('human');
      expect(persisted.deliveryStatus).toBe('sent');
      expect(persisted.authorClientUserId.toString()).toBe(userAObj.toString());
      expect(persisted.idempotencyKey).toBe(idempotencyKey);
    });
  });

  describe('409 BOT_AUTOPILOT_ACTIVE', () => {
    it('returns { statusCode, code, message } when conversation is in bot mode', async () => {
      const idempotencyKey = VALID_UUID_V4();

      const response = await request(app.getHttpServer())
        .post(`/inbox/conversations/${botConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text: 'will be rejected' })
        .expect(409);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          code: 'BOT_AUTOPILOT_ACTIVE',
          message: expect.any(String),
        }),
      );

      // No row persisted, no dispatch.
      expect(mockGateway.send).not.toHaveBeenCalled();
      const count = await connection
        .collection('messages')
        .countDocuments({ conversationId: botConvObj });
      expect(count).toBe(0);
    });
  });

  describe('404 cross-tenant', () => {
    it('returns 404 when conversation belongs to another client', async () => {
      const idempotencyKey = VALID_UUID_V4();

      await request(app.getHttpServer())
        .post(`/inbox/conversations/${foreignConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text: 'cross-tenant' })
        .expect(404);

      expect(mockGateway.send).not.toHaveBeenCalled();
    });
  });

  describe('400 Idempotency-Key validation', () => {
    it('rejects missing header', async () => {
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .send({ text: 'no header' })
        .expect(400);
      expect(mockGateway.send).not.toHaveBeenCalled();
    });

    it('rejects malformed UUID', async () => {
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ text: 'bad uuid' })
        .expect(400);
      expect(mockGateway.send).not.toHaveBeenCalled();
    });

    it('rejects header longer than 64 chars', async () => {
      // 65 characters of `a` — clearly over the ceiling, also not a UUID
      // shape. The controller rejects on length FIRST, so this is the
      // length-failure path even though it's also not a UUID.
      const overLong = 'a'.repeat(65);
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', overLong)
        .send({ text: 'too long' })
        .expect(400);
      expect(mockGateway.send).not.toHaveBeenCalled();
    });
  });

  describe('400 malformed conversationId', () => {
    it('rejects when :conversationId is not a valid ObjectId', async () => {
      const idempotencyKey = VALID_UUID_V4();

      await request(app.getHttpServer())
        .post('/inbox/conversations/not-an-objectid/messages')
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text: 'bad id' })
        .expect(400);
      expect(mockGateway.send).not.toHaveBeenCalled();
    });
  });

  describe('502 on gateway throw + touch on failure', () => {
    it('persists the failed row and advances the conversation list', async () => {
      mockGateway.send.mockRejectedValueOnce(new Error('provider exploded'));

      const idempotencyKey = VALID_UUID_V4();
      const failingText = 'this attempt will fail downstream';

      await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text: failingText })
        .expect(502);

      // The persisted row is visible via the thread read with
      // deliveryStatus === 'failed'.
      const messagesResp = await request(app.getHttpServer())
        .get(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .expect(200);

      const items = messagesResp.body.items as Array<Record<string, unknown>>;
      const failedRow = items.find(
        (m) => m.type === 'human' && m.content === failingText,
      );
      if (failedRow === undefined) {
        throw new Error(
          'Expected the failed operator row to appear in the thread read',
        );
      }
      expect(failedRow.deliveryStatus).toBe('failed');

      // The conversation list now shows the conversation has bubbled up:
      // lastMessagePreview is the operator's text and lastMessageAt has
      // advanced beyond the seeded value (touch fires on failure too).
      const convsResp = await request(app.getHttpServer())
        .get('/inbox/conversations')
        .set('Cookie', sessionCookie)
        .expect(200);

      const human = (
        convsResp.body.items as Array<Record<string, unknown>>
      ).find((c) => c._id === humanConvObj.toString());
      if (human === undefined) {
        throw new Error(
          'Expected the human-mode conversation in the inbox list',
        );
      }
      expect(human.lastMessagePreview).toBe(failingText);
      // The conversation is seeded with `lastMessageAt` one hour in the
      // past (see `reseedConversations`); touch sets it to `new Date()`,
      // which must be strictly newer than the seed. Compare against a
      // lower bound 5 minutes ago — much later than the seed
      // (now - 1h) but safely earlier than the touch-set value (now).
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      expect(new Date(String(human.lastMessageAt)).getTime()).toBeGreaterThan(
        fiveMinutesAgo,
      );
    });
  });

  describe('idempotency replay', () => {
    it('returns the same _id and dispatches exactly once across two requests', async () => {
      const idempotencyKey = VALID_UUID_V4();
      const text = 'replay test text';

      const first = await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/inbox/conversations/${humanConvObj.toString()}/messages`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', idempotencyKey)
        .send({ text })
        .expect(201);

      expect(second.body._id).toBe(first.body._id);
      // The replay branch SHORT-CIRCUITS before the gateway, so total
      // dispatches across the two requests is exactly 1.
      expect(mockGateway.send).toHaveBeenCalledTimes(1);

      // Exactly one persisted row.
      const count = await connection
        .collection('messages')
        .countDocuments({ conversationId: humanConvObj, idempotencyKey });
      expect(count).toBe(1);
    });
  });
});
