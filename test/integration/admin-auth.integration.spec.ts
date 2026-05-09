/**
 * Integration test: AdminAuthModule end-to-end
 *
 * Covers the three integration scenarios called out in the PR#1 plan:
 *   - admin-auth flow (login -> me -> logout -> me-401)
 *   - public-allowlist (health, telegram webhook, onboarding bootstrap reachable
 *     without cookie)
 *   - default-deny (an existing protected admin route returns 401 without cookie)
 *
 * NOTE: this test boots the real `AppModule`, which imports `DatabaseModule`
 * (Mongoose). Running it requires MongoDB to be reachable on
 * `MONGODB_URI` (defaults to `mongodb://localhost:27017/pulsar`). When MongoDB
 * is unreachable the test is skipped with a clear message rather than failing
 * on a Mongoose retry timeout, so local dev without MongoDB doesn't get a
 * noisy red signal for an unrelated reason.
 */
import * as net from 'net';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppModule } from '../../src/app.module';
import { AdminUsersService } from '../../src/features/admin-auth/admin-users.service';
import { ADMIN_SESSION_COOKIE_NAME } from '../../src/features/admin-auth/session-cookie-options';

function probeTcp(
  host: string,
  port: number,
  timeoutMs = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

const TEST_EMAIL = `admin-int-${new Types.ObjectId().toHexString()}@example.com`;
const TEST_PASSWORD = 'integration-pw-123!';

describe('AdminAuth (integration)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mongoUp = true;

  beforeAll(async () => {
    const uri = new URL(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pulsar',
    );
    mongoUp = await probeTcp(uri.hostname, parseInt(uri.port || '27017', 10));
    if (!mongoUp) {
      // eslint-disable-next-line no-console
      console.warn(
        '[admin-auth integration] Skipping: MongoDB unreachable. ' +
          'Run with MongoDB available (same prerequisites as pnpm test:e2e).',
      );
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleRef.get<Connection>(getConnectionToken());

    // Provision a test admin via the public service so we have a known
    // password to authenticate with.
    const adminUsersService = moduleRef.get(AdminUsersService);
    await adminUsersService.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      displayName: 'Integration Admin',
    });
  }, 30000);

  afterAll(async () => {
    if (!mongoUp) return;
    if (connection !== undefined) {
      await connection.collection('admin_users').deleteMany({
        email: TEST_EMAIL,
      });
      await connection.collection('admin_sessions').deleteMany({});
    }
    if (app !== undefined) {
      await app.close();
    }
  }, 30000);

  describe('public allowlist (no cookie required)', () => {
    it('GET / returns 200 without admin cookie', async () => {
      if (!mongoUp) return;
      await request(app.getHttpServer()).get('/').expect(200);
    });

    it('POST /telegram/webhook/:telegramBotId reaches the channel handler (200, not 401)', async () => {
      if (!mongoUp) return;
      const response = await request(app.getHttpServer())
        .post('/telegram/webhook/test-integration-bot')
        .send({ update_id: 1 });
      expect(response.status).toBe(200);
    });

    it('POST /onboarding/register-and-hire reaches the onboarding handler (not 401)', async () => {
      if (!mongoUp) return;
      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({});
      // The route is reachable without a cookie. The exact status depends on
      // request validation; what matters here is that it is NOT a guard 401.
      expect(response.status).not.toBe(401);
    });
  });

  describe('default-deny (no cookie -> 401)', () => {
    it('GET /admin-auth/me returns 401 without a cookie', async () => {
      if (!mongoUp) return;
      await request(app.getHttpServer()).get('/admin-auth/me').expect(401);
    });
  });

  describe('login -> me -> logout flow', () => {
    it('rejects with 401 when credentials are wrong', async () => {
      if (!mongoUp) return;
      await request(app.getHttpServer())
        .post('/admin-auth/login')
        .send({ email: TEST_EMAIL, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects with 401 when email is unknown (constant-time, identical body)', async () => {
      if (!mongoUp) return;
      const wrongEmail = await request(app.getHttpServer())
        .post('/admin-auth/login')
        .send({ email: 'unknown@example.com', password: 'whatever' });
      const wrongPassword = await request(app.getHttpServer())
        .post('/admin-auth/login')
        .send({ email: TEST_EMAIL, password: 'wrong-password' });
      expect(wrongEmail.status).toBe(401);
      expect(wrongPassword.status).toBe(401);
      expect(wrongEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('issues a session cookie on success and authenticates /me with that cookie', async () => {
      if (!mongoUp) return;
      const loginResponse = await request(app.getHttpServer())
        .post('/admin-auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(200);

      expect(loginResponse.body.admin.email).toBe(TEST_EMAIL);

      const setCookies = (loginResponse.headers['set-cookie'] ??
        []) as string[];
      const sessionCookieHeader = setCookies.find((c) =>
        c.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`),
      );
      expect(sessionCookieHeader).toBeDefined();
      expect(sessionCookieHeader).toContain('HttpOnly');
      expect(sessionCookieHeader).toContain('Path=/');
      expect(sessionCookieHeader).toMatch(/Max-Age=\d+/);

      const cookieValue = (sessionCookieHeader as string).split(';')[0];
      const meResponse = await request(app.getHttpServer())
        .get('/admin-auth/me')
        .set('Cookie', cookieValue)
        .expect(200);
      expect(meResponse.body.admin.email).toBe(TEST_EMAIL);

      const logoutResponse = await request(app.getHttpServer())
        .post('/admin-auth/logout')
        .set('Cookie', cookieValue)
        .expect(204);

      const clearCookies = (logoutResponse.headers['set-cookie'] ??
        []) as string[];
      const clearHeader = clearCookies.find((c) =>
        c.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`),
      );
      expect(clearHeader).toBeDefined();
      // Double-clear: at least one Set-Cookie must carry Max-Age=0 OR an
      // expired Expires= value. Both are required for browser flag parity.
      const hasMaxAgeZero = clearCookies.some((c) => /Max-Age=0/i.test(c));
      const hasExpiredExpires = clearCookies.some((c) =>
        /Expires=Thu, 01 Jan 1970/i.test(c),
      );
      expect(hasMaxAgeZero).toBe(true);
      expect(hasExpiredExpires).toBe(true);

      // After logout, the same cookie value must no longer authenticate.
      await request(app.getHttpServer())
        .get('/admin-auth/me')
        .set('Cookie', cookieValue)
        .expect(401);
    }, 15000);
  });
});
