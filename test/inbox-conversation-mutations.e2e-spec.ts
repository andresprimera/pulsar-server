import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppModule } from '../src/app.module';
import { ClientSessionsService } from '../src/features/client-auth/client-sessions.service';
import { CLIENT_SESSION_COOKIE_NAME } from '../src/features/client-auth/client-session-cookie-options';

/**
 * Controller-level e2e for the Phase-3 mutation endpoints:
 *   - PATCH /inbox/conversations/:conversationId/status
 *   - PATCH /inbox/conversations/:conversationId/assignment
 *   - POST  /inbox/conversations/:conversationId/read
 *   - POST  /inbox/conversations/:conversationId/unread
 *   - PUT   /inbox/conversations/:conversationId/tags
 *
 * Mirrors the seeding shape and session minting from
 * `inbox-operator-message.e2e-spec.ts`. Two tenants are seeded; tenant A
 * has an owner (the caller) and two operators (operator-self + a second
 * operator used as the assign-other foil). Tenant B owns a foreign
 * conversation that must read as 404 from tenant A.
 *
 * Coverage:
 *  - PATCH status: 200 happy path, idempotent re-call, 404 cross-tenant,
 *    400 invalid enum, 400 invalid :conversationId.
 *  - PATCH assignment: 200 owner assigns operator, 200 operator
 *    self-assigns, 200 unassign by owner, 403 operator-assigns-other,
 *    422 target not in tenant, 422 target inactive, 400 invalid ObjectId
 *    body.
 *  - POST read: 200 happy + idempotent, 404 cross-tenant.
 *  - POST unread: 200 happy + idempotent on missing, 404 cross-tenant.
 *  - PUT tags: 200 happy, 200 idempotent, 200 dedupe, 400 over-16,
 *    400 invalid char, 400 empty string, 404 cross-tenant.
 *  - List integration: after assigning + marking unread, the list
 *    response surfaces real `assignedOperatorName` / `unreadCount` /
 *    `tags`.
 */
describe('Inbox conversation-mutation endpoints (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  // Tenant A (caller's tenant)
  const clientAObj = new Types.ObjectId();
  const ownerAObj = new Types.ObjectId();
  const operatorSelfObj = new Types.ObjectId();
  const operatorOtherObj = new Types.ObjectId();
  const inactiveOperatorObj = new Types.ObjectId();
  const ownerAEmail = `e2e-owner-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  const operatorSelfEmail = `e2e-op-self-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  const operatorOtherEmail = `e2e-op-other-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  const inactiveOperatorEmail = `e2e-op-inactive-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;

  // Tenant B (foreign — used for the 404 cross-tenant checks)
  const clientBObj = new Types.ObjectId();
  const operatorBObj = new Types.ObjectId();
  const operatorBEmail = `e2e-op-b-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;

  const channelObj = new Types.ObjectId();
  const agentObj = new Types.ObjectId();
  const clientAgentObj = new Types.ObjectId();

  const contactA1Obj = new Types.ObjectId();
  const contactA2Obj = new Types.ObjectId();
  const contactBObj = new Types.ObjectId();

  // Three conversations: convA1 (status/tags/read tests), convA2
  // (assignment tests), foreignConv (404 cross-tenant).
  const convA1Obj = new Types.ObjectId();
  const convA2Obj = new Types.ObjectId();
  const foreignConvObj = new Types.ObjectId();

  let ownerSessionCookie: string;
  let operatorSelfSessionCookie: string;

  const cleanup = async (): Promise<void> => {
    if (!connection) return;
    await connection.collection('conversation_reads').deleteMany({
      conversationId: { $in: [convA1Obj, convA2Obj, foreignConvObj] },
    });
    await connection.collection('conversations').deleteMany({
      _id: { $in: [convA1Obj, convA2Obj, foreignConvObj] },
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
    await connection.collection('users').deleteMany({
      _id: {
        $in: [
          ownerAObj,
          operatorSelfObj,
          operatorOtherObj,
          inactiveOperatorObj,
          operatorBObj,
        ],
      },
    });
    await connection.collection('client_user_sessions').deleteMany({
      userId: { $in: [ownerAObj, operatorSelfObj] },
    });
  };

  const reseedConversations = async (): Promise<void> => {
    await connection.collection('conversation_reads').deleteMany({
      conversationId: { $in: [convA1Obj, convA2Obj, foreignConvObj] },
    });
    await connection.collection('conversations').deleteMany({
      _id: { $in: [convA1Obj, convA2Obj, foreignConvObj] },
    });

    const now = new Date(Date.now() - 60 * 60 * 1000); // 1h ago

    await connection.collection('conversations').insertMany([
      {
        _id: convA1Obj,
        clientId: clientAObj,
        contactId: contactA1Obj,
        channelId: channelObj,
        clientAgentId: clientAgentObj,
        status: 'open',
        controlMode: 'human',
        lastMessageAt: now,
        lastMessagePreview: 'preview A1',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: convA2Obj,
        clientId: clientAObj,
        contactId: contactA2Obj,
        channelId: channelObj,
        clientAgentId: clientAgentObj,
        status: 'open',
        controlMode: 'human',
        lastMessageAt: now,
        lastMessagePreview: 'preview A2',
        tags: [],
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
        lastMessagePreview: 'preview foreign',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    await cleanup();

    await connection.collection('clients').insertMany([
      {
        _id: clientAObj,
        name: 'E2E Mutations Tenant A',
        type: 'individual',
        status: 'active',
        billingCurrency: 'USD',
        billingAnchor: new Date(),
      },
      {
        _id: clientBObj,
        name: 'E2E Mutations Tenant B (foreign)',
        type: 'individual',
        status: 'active',
        billingCurrency: 'USD',
        billingAnchor: new Date(),
      },
    ]);

    await connection.collection('channels').insertOne({
      _id: channelObj,
      name: `e2e-mut-channel-${channelObj.toString()}`,
      type: 'whatsapp',
      supportedProviders: ['meta'],
    });
    await connection.collection('agents').insertOne({
      _id: agentObj,
      name: 'E2E Mutations Agent',
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
          phoneNumberId: 'e2e-mut-phone',
          credentials: { phoneNumberId: 'e2e-mut-phone' },
          amount: 0,
          currency: 'USD',
          monthlyMessageQuota: null,
        },
      ],
    });

    await connection.collection('contacts').insertMany([
      {
        _id: contactA1Obj,
        externalId: 'mut-1',
        identifier: { type: 'phone', value: '+11111111111' },
        clientId: clientAObj,
        channelId: channelObj,
        name: 'Contact A1',
        metadata: {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: contactA2Obj,
        externalId: 'mut-2',
        identifier: { type: 'phone', value: '+12222222222' },
        clientId: clientAObj,
        channelId: channelObj,
        name: 'Contact A2',
        metadata: {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: contactBObj,
        externalId: 'mut-3',
        identifier: { type: 'phone', value: '+13333333333' },
        clientId: clientBObj,
        channelId: channelObj,
        name: 'Contact B',
        metadata: {},
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await connection.collection('users').insertMany([
      {
        _id: ownerAObj,
        email: ownerAEmail,
        name: 'Olivia O.',
        clientId: clientAObj,
        status: 'active',
        clientRole: 'owner',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: operatorSelfObj,
        email: operatorSelfEmail,
        name: 'Sam S.',
        clientId: clientAObj,
        status: 'active',
        clientRole: 'operator',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: operatorOtherObj,
        email: operatorOtherEmail,
        name: 'Otto O.',
        clientId: clientAObj,
        status: 'active',
        clientRole: 'operator',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: inactiveOperatorObj,
        email: inactiveOperatorEmail,
        name: 'Ivy I.',
        clientId: clientAObj,
        status: 'inactive',
        clientRole: 'operator',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: operatorBObj,
        email: operatorBEmail,
        name: 'Bob B.',
        clientId: clientBObj,
        status: 'active',
        clientRole: 'operator',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const sessionsService = moduleFixture.get(ClientSessionsService);
    const ownerIssued = await sessionsService.issue({
      userId: ownerAObj,
      clientId: clientAObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    ownerSessionCookie = `${CLIENT_SESSION_COOKIE_NAME}=${ownerIssued.rawToken}`;

    const operatorIssued = await sessionsService.issue({
      userId: operatorSelfObj,
      clientId: clientAObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    operatorSelfSessionCookie = `${CLIENT_SESSION_COOKIE_NAME}=${operatorIssued.rawToken}`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await reseedConversations();
  });

  describe('PATCH /status', () => {
    it('200 happy path: changes status and returns the enriched DTO', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA1Obj.toString()}/status`)
        .set('Cookie', ownerSessionCookie)
        .send({ status: 'closed' })
        .expect(200);

      expect(res.body._id).toBe(convA1Obj.toString());
      expect(res.body.status).toBe('closed');
    });

    it('200 idempotent re-call when status unchanged', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA1Obj.toString()}/status`)
        .set('Cookie', ownerSessionCookie)
        .send({ status: 'open' })
        .expect(200);

      expect(res.body.status).toBe('open');
    });

    it('404 cross-tenant', async () => {
      await request(app.getHttpServer())
        .patch(`/inbox/conversations/${foreignConvObj.toString()}/status`)
        .set('Cookie', ownerSessionCookie)
        .send({ status: 'closed' })
        .expect(404);
    });

    it('400 invalid status enum', async () => {
      await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA1Obj.toString()}/status`)
        .set('Cookie', ownerSessionCookie)
        .send({ status: 'frozen' })
        .expect(400);
    });

    it('400 invalid :conversationId', async () => {
      await request(app.getHttpServer())
        .patch('/inbox/conversations/not-an-objectid/status')
        .set('Cookie', ownerSessionCookie)
        .send({ status: 'closed' })
        .expect(400);
    });
  });

  describe('PATCH /assignment', () => {
    it('200 owner assigns an operator (happy path)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', ownerSessionCookie)
        .send({ operatorClientUserId: operatorSelfObj.toString() })
        .expect(200);

      expect(res.body.assignedOperatorName).toBe('Sam S.');
    });

    it('200 operator self-assigns', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', operatorSelfSessionCookie)
        .send({ operatorClientUserId: operatorSelfObj.toString() })
        .expect(200);

      expect(res.body.assignedOperatorName).toBe('Sam S.');
    });

    it('200 unassign by owner', async () => {
      // First assign someone.
      await connection
        .collection('conversations')
        .updateOne(
          { _id: convA2Obj },
          { $set: { assignedOperatorId: operatorSelfObj } },
        );

      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', ownerSessionCookie)
        .send({ operatorClientUserId: null })
        .expect(200);

      expect(res.body.assignedOperatorName).toBeNull();
    });

    it('403 operator-assigns-other', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', operatorSelfSessionCookie)
        .send({ operatorClientUserId: operatorOtherObj.toString() })
        .expect(403);

      expect(res.body.code).toBe('INSUFFICIENT_PRIVILEGE');
    });

    it('422 target not in tenant', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', ownerSessionCookie)
        .send({ operatorClientUserId: operatorBObj.toString() })
        .expect(422);

      expect(res.body.code).toBe('OPERATOR_NOT_IN_TENANT');
    });

    it('422 target inactive', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', ownerSessionCookie)
        .send({ operatorClientUserId: inactiveOperatorObj.toString() })
        .expect(422);

      expect(res.body.code).toBe('OPERATOR_NOT_IN_TENANT');
    });

    it('400 invalid ObjectId in body', async () => {
      await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA2Obj.toString()}/assignment`)
        .set('Cookie', ownerSessionCookie)
        .send({ operatorClientUserId: 'not-a-mongo-id' })
        .expect(400);
    });
  });

  describe('POST /read', () => {
    it('200 happy path returns { unread: false, lastReadAt }', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inbox/conversations/${convA1Obj.toString()}/read`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);

      expect(res.body.unread).toBe(false);
      expect(res.body.lastReadAt).toEqual(expect.any(String));
    });

    it('200 idempotent re-call', async () => {
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${convA1Obj.toString()}/read`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${convA1Obj.toString()}/read`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);

      const count = await connection
        .collection('conversation_reads')
        .countDocuments({
          conversationId: convA1Obj,
          operatorClientUserId: operatorSelfObj,
        });
      expect(count).toBe(1);
    });

    it('404 cross-tenant', async () => {
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${foreignConvObj.toString()}/read`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(404);
    });
  });

  describe('POST /unread', () => {
    it('200 happy path returns { unread: true, lastReadAt: null }', async () => {
      // First mark read so there is a row to delete.
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${convA1Obj.toString()}/read`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/inbox/conversations/${convA1Obj.toString()}/unread`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);

      expect(res.body.unread).toBe(true);
      expect(res.body.lastReadAt).toBeNull();

      const count = await connection
        .collection('conversation_reads')
        .countDocuments({
          conversationId: convA1Obj,
          operatorClientUserId: operatorSelfObj,
        });
      expect(count).toBe(0);
    });

    it('200 idempotent on missing record', async () => {
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${convA1Obj.toString()}/unread`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);
    });

    it('404 cross-tenant', async () => {
      await request(app.getHttpServer())
        .post(`/inbox/conversations/${foreignConvObj.toString()}/unread`)
        .set('Cookie', operatorSelfSessionCookie)
        .expect(404);
    });
  });

  describe('PUT /tags', () => {
    it('200 happy path replaces tags', async () => {
      const res = await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['vip', 'urgent'] })
        .expect(200);

      expect(res.body.tags).toEqual(['vip', 'urgent']);
    });

    it('200 idempotent re-call', async () => {
      await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['vip'] })
        .expect(200);
      const res = await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['vip'] })
        .expect(200);

      expect(res.body.tags).toEqual(['vip']);
    });

    it('200 dedupe (case-insensitive)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['VIP', 'vip', 'Urgent'] })
        .expect(200);

      expect(res.body.tags).toEqual(['vip', 'urgent']);
    });

    it('400 over-16 tags', async () => {
      const tags = Array.from({ length: 17 }, (_, i) => `tag${i}`);
      await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags })
        .expect(400);
    });

    it('400 invalid character', async () => {
      await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['bad space'] })
        .expect(400);
    });

    it('400 empty string entry', async () => {
      await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: [''] })
        .expect(400);
    });

    it('404 cross-tenant', async () => {
      await request(app.getHttpServer())
        .put(`/inbox/conversations/${foreignConvObj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['vip'] })
        .expect(404);
    });
  });

  describe('list integration', () => {
    it('GET /conversations surfaces assignedOperatorName, unreadCount, tags', async () => {
      // Assign + tag + leave unread (no mark-read for the operator).
      await request(app.getHttpServer())
        .patch(`/inbox/conversations/${convA1Obj.toString()}/assignment`)
        .set('Cookie', ownerSessionCookie)
        .send({ operatorClientUserId: operatorSelfObj.toString() })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/inbox/conversations/${convA1Obj.toString()}/tags`)
        .set('Cookie', ownerSessionCookie)
        .send({ tags: ['vip'] })
        .expect(200);

      // Fetch the list as operator-self; the row should report
      // assignedOperatorName='Sam S.', unreadCount=1 (no read record),
      // tags=['vip'].
      const res = await request(app.getHttpServer())
        .get('/inbox/conversations')
        .set('Cookie', operatorSelfSessionCookie)
        .expect(200);

      const row = (res.body.items as Array<Record<string, unknown>>).find(
        (c) => c._id === convA1Obj.toString(),
      );
      if (row === undefined) {
        throw new Error('Expected convA1 in the inbox list');
      }
      expect(row.assignedOperatorName).toBe('Sam S.');
      expect(row.tags).toEqual(['vip']);
      expect(row.unreadCount).toBe(1);
    });
  });
});
