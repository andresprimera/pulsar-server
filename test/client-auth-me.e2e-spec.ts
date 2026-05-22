import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppModule } from '../src/app.module';
import { ClientSessionsService } from '../src/features/client-auth/client-sessions.service';
import { CLIENT_SESSION_COOKIE_NAME } from '../src/features/client-auth/client-session-cookie-options';

/**
 * Controller-level e2e for `GET /client-auth/me` and `POST /client-auth/logout`,
 * exercising the role widening from owner-only to owner+operator.
 *
 * Approach: seed `clients` + two `users` rows (one owner, one operator)
 * directly via the Mongo connection, then mint sessions via
 * `ClientSessionsService.issue(...)` so requests carry real
 * `pulsar_client_session` cookies.
 *
 * Coverage:
 *  - E1 GET /me with owner session → 200 + owner principal (regression).
 *  - E2 GET /me with operator session → 200 + operator principal.
 *  - E3 GET /me with no cookie → 401.
 *  - E4 POST /logout with owner session → 204 + Set-Cookie clears with
 *       HttpOnly + Path=/.
 *  - E5 POST /logout with operator session → 204 + Set-Cookie clears with
 *       HttpOnly + Path=/.
 *  - E6 GET /me reusing the cookie returned by E5 → 401 (revoked).
 *  - E7 Round-trip POST /login (operator creds) → GET /me with the cookie
 *       returned by login → both 200, operator envelope.
 *  - E8 GET /me with operator session whose user.status === 'inactive'
 *       → 401 (status gate orthogonal to role widening).
 */
describe('Client-auth /me + /logout (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  const clientObj = new Types.ObjectId();
  const ownerObj = new Types.ObjectId();
  const operatorObj = new Types.ObjectId();
  const inactiveOperatorObj = new Types.ObjectId();

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `e2e-owner-${suffix}@example.com`;
  const operatorEmail = `e2e-operator-${suffix}@example.com`;
  const inactiveOperatorEmail = `e2e-inactive-operator-${suffix}@example.com`;
  // `client-auth.service` uses argon2id to verify passwords; for sessions
  // minted directly via `ClientSessionsService.issue` we don't need a real
  // password, but E7 exercises the real login dance so we hash the
  // plaintext once at setup time using the same algorithm.
  const PLAINTEXT_PASSWORD = 'password-operator-e2e';

  let ownerCookie: string;
  let operatorCookie: string;
  let inactiveOperatorCookie: string;

  const cleanup = async (): Promise<void> => {
    if (!connection) return;
    await connection
      .collection('client_user_sessions')
      .deleteMany({
        userId: { $in: [ownerObj, operatorObj, inactiveOperatorObj] },
      });
    await connection
      .collection('users')
      .deleteMany({
        _id: { $in: [ownerObj, operatorObj, inactiveOperatorObj] },
      });
    await connection.collection('clients').deleteMany({ _id: clientObj });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    await cleanup();

    await connection.collection('clients').insertOne({
      _id: clientObj,
      name: `E2E Client ${suffix}`,
      slug: `e2e-client-${suffix}`,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Hash with argon2id (matches the algorithm `ClientAuthService` uses
    // via `argon2.verify`). Per-suite hash so the seed is deterministic
    // for E7 but does not embed a fixed cleartext in the repository.
    const passwordHash = await argon2.hash(PLAINTEXT_PASSWORD, {
      type: argon2.argon2id,
    });

    await connection.collection('users').insertMany([
      {
        _id: ownerObj,
        email: ownerEmail,
        name: 'E2E Owner',
        clientId: clientObj,
        status: 'active',
        clientRole: 'owner',
        passwordHash,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: operatorObj,
        email: operatorEmail,
        name: 'E2E Operator',
        clientId: clientObj,
        status: 'active',
        clientRole: 'operator',
        passwordHash,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: inactiveOperatorObj,
        email: inactiveOperatorEmail,
        name: 'E2E Inactive Operator',
        clientId: clientObj,
        // Seeded `active` so `ClientSessionsService.issue` succeeds; the
        // E8 test mutates this to `inactive` immediately before the /me
        // call to exercise the status-gate orthogonality path.
        status: 'active',
        clientRole: 'operator',
        passwordHash,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const sessions = moduleFixture.get(ClientSessionsService);
    const ownerIssued = await sessions.issue({
      userId: ownerObj,
      clientId: clientObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    const operatorIssued = await sessions.issue({
      userId: operatorObj,
      clientId: clientObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    const inactiveIssued = await sessions.issue({
      userId: inactiveOperatorObj,
      clientId: clientObj,
      userAgent: 'e2e',
      ip: '127.0.0.1',
    });
    ownerCookie = `${CLIENT_SESSION_COOKIE_NAME}=${ownerIssued.rawToken}`;
    operatorCookie = `${CLIENT_SESSION_COOKIE_NAME}=${operatorIssued.rawToken}`;
    inactiveOperatorCookie = `${CLIENT_SESSION_COOKIE_NAME}=${inactiveIssued.rawToken}`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('GET /client-auth/me', () => {
    it('E1: owner session → 200 + owner principal', async () => {
      const response = await request(app.getHttpServer())
        .get('/client-auth/me')
        .set('Cookie', ownerCookie)
        .expect(200);
      expect(response.body.principal).toEqual(
        expect.objectContaining({
          kind: 'clientUser',
          clientRole: 'owner',
          email: ownerEmail,
          status: 'active',
          clientId: clientObj.toString(),
        }),
      );
    });

    it('E2: operator session → 200 + operator principal', async () => {
      const response = await request(app.getHttpServer())
        .get('/client-auth/me')
        .set('Cookie', operatorCookie)
        .expect(200);
      expect(response.body.principal.clientRole).toBe('operator');
      expect(response.body.principal).toEqual(
        expect.objectContaining({
          kind: 'clientUser',
          email: operatorEmail,
          status: 'active',
          clientId: clientObj.toString(),
        }),
      );
    });

    it('E3: no cookie → 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/client-auth/me')
        .expect(401);
      expect(typeof response.body.message).toBe('string');
    });

    it('E8: operator session whose user.status is inactive → 401 (status gate)', async () => {
      // Flip status to inactive AFTER the session was issued; the gate
      // lives in the `me` handler itself, not in the session cookie.
      await connection
        .collection('users')
        .updateOne(
          { _id: inactiveOperatorObj },
          { $set: { status: 'inactive', updatedAt: new Date() } },
        );

      await request(app.getHttpServer())
        .get('/client-auth/me')
        .set('Cookie', inactiveOperatorCookie)
        .expect(401);
    });
  });

  describe('POST /client-auth/logout', () => {
    const expectsCleared = (setCookieHeader: string | string[]): void => {
      const headers = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader];
      const clearing = headers.find((h) =>
        h.startsWith(`${CLIENT_SESSION_COOKIE_NAME}=`),
      );
      expect(clearing).toBeDefined();
      const value = clearing as string;
      // Defensive expiry + zero maxAge (matches `clearSessionCookie` in
      // the controller). HttpOnly and Path=/ must always be present.
      expect(value.toLowerCase()).toContain('httponly');
      expect(value).toContain('Path=/');
    };

    it('E4: owner session → 204 + cookie cleared with HttpOnly + Path=/', async () => {
      // Mint a fresh owner session so revoking it does not affect E1/E2/E3.
      const sessions = app.get(ClientSessionsService);
      const fresh = await sessions.issue({
        userId: ownerObj,
        clientId: clientObj,
        userAgent: 'e2e',
        ip: '127.0.0.1',
      });
      const cookie = `${CLIENT_SESSION_COOKIE_NAME}=${fresh.rawToken}`;

      const response = await request(app.getHttpServer())
        .post('/client-auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expectsCleared(setCookie);
    });

    it('E5: operator session → 204 + cookie cleared with HttpOnly + Path=/', async () => {
      // Mint a fresh operator session so revoking it does not affect E2.
      const sessions = app.get(ClientSessionsService);
      const fresh = await sessions.issue({
        userId: operatorObj,
        clientId: clientObj,
        userAgent: 'e2e',
        ip: '127.0.0.1',
      });
      const cookie = `${CLIENT_SESSION_COOKIE_NAME}=${fresh.rawToken}`;

      const response = await request(app.getHttpServer())
        .post('/client-auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expectsCleared(setCookie);

      // E6: reusing the (now-revoked) cookie on /me must 401.
      await request(app.getHttpServer())
        .get('/client-auth/me')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('round-trip login → me', () => {
    it('E7: operator login then me both succeed with operator envelope', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/client-auth/login')
        .send({ email: operatorEmail, password: PLAINTEXT_PASSWORD })
        .expect(200);

      expect(loginResponse.body.principal.clientRole).toBe('operator');
      const loginCookies = loginResponse.headers['set-cookie'];
      expect(loginCookies).toBeDefined();
      const cookieHeader = (
        Array.isArray(loginCookies) ? loginCookies : [loginCookies]
      ).find((c) => c.startsWith(`${CLIENT_SESSION_COOKIE_NAME}=`));
      expect(cookieHeader).toBeDefined();
      const sessionCookie = (cookieHeader as string).split(';')[0];

      const meResponse = await request(app.getHttpServer())
        .get('/client-auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);
      expect(meResponse.body.principal.clientRole).toBe('operator');
      expect(meResponse.body.principal.email).toBe(operatorEmail);
    });
  });
});
