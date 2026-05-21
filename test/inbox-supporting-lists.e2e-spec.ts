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
 * Phase 5 — controller-level e2e for the inbox supporting-list
 * endpoints:
 *   - GET /inbox/channels
 *   - GET /inbox/contacts
 *
 * Mirrors the seeding shape of `inbox-conversation-mutations.e2e-spec.ts`.
 * Two tenants are seeded (A = caller, B = foreign). Tenant A hires two
 * distinct `Channel`s via two `ClientAgent`s; the per-channel contact
 * set is large enough to exercise cursor pagination and the
 * "missing-Channel → provider='unknown'" graceful-degradation path.
 *
 * Coverage (per plan §9):
 *   - GET /inbox/channels: happy path returns deduped tenant rows with
 *     `provider` = `Channel.type` and `status` reflecting hire binding;
 *     excludes tenant B's hires.
 *   - GET /inbox/contacts: happy path returns tenant A's contacts with
 *     `conversationCount` reflecting seeded counts; `lastSeen` matches
 *     `Contact.updatedAt`.
 *   - GET /inbox/contacts: cursor pagination across two pages.
 *   - GET /inbox/contacts: `?limit=0` and `?limit=101` return 400.
 *   - GET /inbox/contacts: `provider` is always a non-null string;
 *     a contact whose `channelId` points to a deleted `Channel` reads
 *     as `provider === 'unknown'`.
 *   - 401 when unauthenticated.
 *
 * The plan also asked for a 403 test on a non-allowed `@ClientRoles`
 * role. The current `CLIENT_ROLES` enum is exhaustively
 * `['owner', 'operator']` and both routes accept the full set, so there
 * is no real client role that can yield 403; the scenario is structural
 * dead-code at the moment and is therefore omitted here. When the enum
 * widens (per the forward-only enum rule), a sibling test should be
 * added.
 */
describe('Inbox supporting-list endpoints (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  // Tenant A (caller's tenant)
  const clientAObj = new Types.ObjectId();
  const ownerAObj = new Types.ObjectId();
  const ownerAEmail = `e2e-lists-owner-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;

  // Tenant B (foreign — its hires/contacts must NOT show on tenant A's
  // responses).
  const clientBObj = new Types.ObjectId();

  // Two real channels (tenant A hires both), plus one channel that
  // exists only to be deleted before assertions so an A-tenant contact
  // can point at it and prove the `provider='unknown'` fallback.
  const channelW = new Types.ObjectId(); // whatsapp
  const channelT = new Types.ObjectId(); // telegram
  const channelGoneObj = new Types.ObjectId();
  const channelB = new Types.ObjectId(); // tenant B exclusive — must not leak

  // Two distinct hires on tenant A binding the two real channels.
  const agentObj = new Types.ObjectId();
  const clientAgent1Obj = new Types.ObjectId();
  const clientAgent2Obj = new Types.ObjectId();
  const clientAgentBObj = new Types.ObjectId();

  // Three contacts on tenant A — two bound to real channels and one
  // bound to the (about-to-be-deleted) channel.
  const contactA1Obj = new Types.ObjectId();
  const contactA2Obj = new Types.ObjectId();
  const contactA3Obj = new Types.ObjectId();
  // One contact on tenant B (must not leak).
  const contactBObj = new Types.ObjectId();

  // Conversation seeds for the conversationCount aggregation.
  const convA1aObj = new Types.ObjectId();
  const convA1bObj = new Types.ObjectId();
  const convA2Obj = new Types.ObjectId();

  let ownerSessionCookie: string;

  const cleanup = async (): Promise<void> => {
    if (!connection) return;
    await connection.collection('conversations').deleteMany({
      _id: { $in: [convA1aObj, convA1bObj, convA2Obj] },
    });
    await connection.collection('contacts').deleteMany({
      _id: { $in: [contactA1Obj, contactA2Obj, contactA3Obj, contactBObj] },
    });
    await connection.collection('client_agents').deleteMany({
      _id: { $in: [clientAgent1Obj, clientAgent2Obj, clientAgentBObj] },
    });
    await connection.collection('agents').deleteMany({ _id: agentObj });
    await connection.collection('channels').deleteMany({
      _id: { $in: [channelW, channelT, channelGoneObj, channelB] },
    });
    await connection
      .collection('clients')
      .deleteMany({ _id: { $in: [clientAObj, clientBObj] } });
    await connection.collection('users').deleteMany({ _id: ownerAObj });
    await connection
      .collection('client_user_sessions')
      .deleteMany({ userId: ownerAObj });
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

    // Clients.
    await connection.collection('clients').insertMany([
      {
        _id: clientAObj,
        name: 'E2E Lists Tenant A',
        type: 'individual',
        status: 'active',
        billingCurrency: 'USD',
        billingAnchor: new Date(),
      },
      {
        _id: clientBObj,
        name: 'E2E Lists Tenant B (foreign)',
        type: 'individual',
        status: 'active',
        billingCurrency: 'USD',
        billingAnchor: new Date(),
      },
    ]);

    // Channels.
    await connection.collection('channels').insertMany([
      {
        _id: channelW,
        name: `e2e-lists-channel-w-${channelW.toString()}`,
        type: 'whatsapp',
        supportedProviders: ['meta'],
      },
      {
        _id: channelT,
        name: `e2e-lists-channel-t-${channelT.toString()}`,
        type: 'telegram',
        supportedProviders: ['telegram'],
      },
      {
        _id: channelGoneObj,
        name: `e2e-lists-channel-gone-${channelGoneObj.toString()}`,
        type: 'whatsapp',
        supportedProviders: ['meta'],
      },
      {
        _id: channelB,
        name: `e2e-lists-channel-b-${channelB.toString()}`,
        type: 'instagram',
        supportedProviders: ['instagram'],
      },
    ]);

    // Agent + hires. Tenant A has two distinct hires: one binding
    // channelW (active), one binding channelT (active). Tenant B has a
    // hire on channelB that must NOT leak into A's response.
    await connection.collection('agents').insertOne({
      _id: agentObj,
      name: 'E2E Lists Agent',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    });

    await connection.collection('client_agents').insertMany([
      {
        _id: clientAgent1Obj,
        clientId: clientAObj.toString(),
        agentId: agentObj.toString(),
        status: 'active',
        channels: [
          {
            channelId: channelW,
            provider: 'meta',
            status: 'active',
            phoneNumberId: 'e2e-lists-phone-1',
            amount: 0,
            currency: 'USD',
            monthlyMessageQuota: null,
          },
        ],
      },
      {
        _id: clientAgent2Obj,
        clientId: clientAObj.toString(),
        agentId: agentObj.toString() + '-2',
        status: 'active',
        channels: [
          {
            channelId: channelT,
            provider: 'telegram',
            status: 'active',
            telegramBotId: 'e2e-lists-tg',
            amount: 0,
            currency: 'USD',
            monthlyMessageQuota: null,
          },
        ],
      },
      {
        _id: clientAgentBObj,
        clientId: clientBObj.toString(),
        agentId: agentObj.toString() + '-b',
        status: 'active',
        channels: [
          {
            channelId: channelB,
            provider: 'instagram',
            status: 'active',
            instagramAccountId: 'e2e-lists-ig',
            amount: 0,
            currency: 'USD',
            monthlyMessageQuota: null,
          },
        ],
      },
    ]);

    // Contacts. Tenant A: 3 contacts with deterministic `updatedAt`
    // values so cursor pagination assertions are stable. Tenant B: 1
    // contact (must not leak).
    const ts1 = new Date('2026-05-19T10:00:03Z');
    const ts2 = new Date('2026-05-19T10:00:02Z');
    const ts3 = new Date('2026-05-19T10:00:01Z');
    const tsB = new Date('2026-05-19T10:00:00Z');

    await connection.collection('contacts').insertMany([
      {
        _id: contactA1Obj,
        externalId: 'lists-1',
        identifier: { type: 'email', value: 'jane@example.com' },
        clientId: clientAObj,
        channelId: channelW,
        name: 'Jane Doe',
        metadata: {},
        status: 'active',
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        _id: contactA2Obj,
        externalId: 'lists-2',
        identifier: { type: 'phone', value: '+12025550100' },
        clientId: clientAObj,
        channelId: channelT,
        name: 'John Roe',
        metadata: {},
        status: 'active',
        createdAt: ts2,
        updatedAt: ts2,
      },
      {
        _id: contactA3Obj,
        externalId: 'lists-3',
        identifier: { type: 'phone', value: '+12025550101' },
        clientId: clientAObj,
        // Points at a Channel that is about to be deleted to exercise
        // the `provider='unknown'` fallback path.
        channelId: channelGoneObj,
        name: 'Ghost C.',
        metadata: {},
        status: 'active',
        createdAt: ts3,
        updatedAt: ts3,
      },
      {
        _id: contactBObj,
        externalId: 'lists-b',
        identifier: { type: 'phone', value: '+19999999999' },
        clientId: clientBObj,
        channelId: channelB,
        name: 'Foreign C.',
        metadata: {},
        status: 'active',
        createdAt: tsB,
        updatedAt: tsB,
      },
    ]);

    // Conversations: 2 for contactA1, 1 for contactA2, 0 for contactA3.
    const now = new Date();
    await connection.collection('conversations').insertMany([
      {
        _id: convA1aObj,
        clientId: clientAObj,
        contactId: contactA1Obj,
        channelId: channelW,
        clientAgentId: clientAgent1Obj,
        status: 'open',
        controlMode: 'human',
        lastMessageAt: now,
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: convA1bObj,
        clientId: clientAObj,
        contactId: contactA1Obj,
        channelId: channelW,
        clientAgentId: clientAgent1Obj,
        status: 'closed',
        controlMode: 'human',
        lastMessageAt: now,
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: convA2Obj,
        clientId: clientAObj,
        contactId: contactA2Obj,
        channelId: channelT,
        clientAgentId: clientAgent2Obj,
        status: 'archived',
        controlMode: 'human',
        lastMessageAt: now,
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Owner user + session.
    await connection.collection('users').insertOne({
      _id: ownerAObj,
      email: ownerAEmail,
      name: 'Olivia O.',
      clientId: clientAObj,
      status: 'active',
      clientRole: 'owner',
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sessionsService = moduleFixture.get(ClientSessionsService);
    const ownerIssued = await sessionsService.issue({
      userId: ownerAObj,
      clientId: clientAObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    ownerSessionCookie = `${CLIENT_SESSION_COOKIE_NAME}=${ownerIssued.rawToken}`;

    // Delete the placeholder Channel so contactA3 surfaces with
    // `provider='unknown'` per Decision graceful-degradation.
    await connection.collection('channels').deleteOne({ _id: channelGoneObj });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    jest.restoreAllMocks();
  });

  describe('GET /inbox/channels', () => {
    it('returns the two deduped tenant-A rows with provider=Channel.type', async () => {
      const res = await request(app.getHttpServer())
        .get('/inbox/channels')
        .set('Cookie', ownerSessionCookie)
        .expect(200);

      expect(Array.isArray(res.body.items)).toBe(true);
      const items = res.body.items as Array<{
        id: string;
        provider: string;
        label: string;
        status: 'active' | 'inactive';
      }>;
      expect(items).toHaveLength(2);
      const byId = new Map(items.map((i) => [i.id, i]));
      const w = byId.get(channelW.toString());
      const t = byId.get(channelT.toString());
      expect(w).toBeDefined();
      expect(t).toBeDefined();
      expect(w?.provider).toBe('whatsapp');
      expect(t?.provider).toBe('telegram');
      expect(w?.status).toBe('active');
      expect(t?.status).toBe('active');
    });

    it("excludes tenant B's hires", async () => {
      const res = await request(app.getHttpServer())
        .get('/inbox/channels')
        .set('Cookie', ownerSessionCookie)
        .expect(200);
      const ids = (res.body.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).not.toContain(channelB.toString());
    });

    it('401 when unauthenticated', async () => {
      await request(app.getHttpServer()).get('/inbox/channels').expect(401);
    });
  });

  describe('GET /inbox/contacts', () => {
    it('returns tenant A contacts only with conversationCount and lastSeen', async () => {
      const res = await request(app.getHttpServer())
        .get('/inbox/contacts')
        .set('Cookie', ownerSessionCookie)
        .expect(200);

      const items = res.body.items as Array<{
        id: string;
        name: string;
        email: string | null;
        provider: string;
        conversationCount: number;
        lastSeen: string;
      }>;
      const byId = new Map(items.map((i) => [i.id, i]));

      expect(byId.has(contactBObj.toString())).toBe(false); // tenant B is invisible

      const a1 = byId.get(contactA1Obj.toString());
      const a2 = byId.get(contactA2Obj.toString());
      const a3 = byId.get(contactA3Obj.toString());
      expect(a1?.conversationCount).toBe(2);
      expect(a2?.conversationCount).toBe(1);
      expect(a3?.conversationCount).toBe(0);

      // lastSeen mirrors Contact.updatedAt (ISO 8601 round-trip).
      if (a1 === undefined) {
        throw new Error('expected contactA1 in the response');
      }
      expect(new Date(a1.lastSeen).toISOString()).toBe(
        '2026-05-19T10:00:03.000Z',
      );

      // email is the identifier value only when type === 'email'.
      expect(a1?.email).toBe('jane@example.com');
      expect(a2?.email).toBeNull();
      expect(a3?.email).toBeNull();
    });

    it('NEVER returns provider: null — falls back to the literal string "unknown"', async () => {
      const res = await request(app.getHttpServer())
        .get('/inbox/contacts')
        .set('Cookie', ownerSessionCookie)
        .expect(200);

      const items = res.body.items as Array<{ id: string; provider: unknown }>;
      // Per the wire contract `provider: string`. The `'unknown'` literal
      // is the only safe fallback when the join is missing.
      for (const item of items) {
        expect(typeof item.provider).toBe('string');
        expect(item.provider).not.toBeNull();
      }
      const a3 = items.find((i) => i.id === contactA3Obj.toString());
      expect(a3?.provider).toBe('unknown');
    });

    it('cursor pagination: first page yields nextCursor; second page completes the list', async () => {
      // Page 1: limit=2.
      const page1 = await request(app.getHttpServer())
        .get('/inbox/contacts?limit=2')
        .set('Cookie', ownerSessionCookie)
        .expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(typeof page1.body.nextCursor).toBe('string');

      const page2 = await request(app.getHttpServer())
        .get(
          `/inbox/contacts?limit=2&cursor=${encodeURIComponent(
            page1.body.nextCursor,
          )}`,
        )
        .set('Cookie', ownerSessionCookie)
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      // No row appears on both pages.
      const ids1 = (page1.body.items as Array<{ id: string }>).map((i) => i.id);
      const ids2 = (page2.body.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });

    it('400 when ?limit=0', async () => {
      await request(app.getHttpServer())
        .get('/inbox/contacts?limit=0')
        .set('Cookie', ownerSessionCookie)
        .expect(400);
    });

    it('400 when ?limit=101', async () => {
      await request(app.getHttpServer())
        .get('/inbox/contacts?limit=101')
        .set('Cookie', ownerSessionCookie)
        .expect(400);
    });

    it('401 when unauthenticated', async () => {
      await request(app.getHttpServer()).get('/inbox/contacts').expect(401);
    });
  });
});
