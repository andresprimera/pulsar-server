import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Connection } from 'mongoose';
import { AdminUsersService } from '../../src/features/admin-auth/admin-users.service';

const TEST_ADMIN_PASSWORD = 'e2e-admin-pw-9X!';

export interface AdminTestAuth {
  email: string;
  cookie: string;
  cleanup: () => Promise<void>;
}

/**
 * Provisions a disposable admin user via `AdminUsersService.create` and
 * logs it in via `POST /admin-auth/login`, returning the resulting
 * `Set-Cookie` value. Use the returned `cookie` with
 * `.set('Cookie', cookie)` on subsequent supertest calls so e2e flows
 * that hit admin endpoints can authenticate.
 *
 * The returned `cleanup` removes the admin and any session documents
 * it created. Call it in `afterAll`.
 */
export async function loginAsTestAdmin(
  app: INestApplication,
  connection: Connection,
): Promise<AdminTestAuth> {
  const email = `e2e-admin-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;

  const adminUsersService = app.get(AdminUsersService);
  await adminUsersService.create({
    email,
    password: TEST_ADMIN_PASSWORD,
    displayName: 'E2E Admin',
    role: 'super_admin',
  });

  const loginResponse = await request(app.getHttpServer())
    .post('/admin-auth/login')
    .send({ email, password: TEST_ADMIN_PASSWORD })
    .expect(200);

  const setCookies = (loginResponse.headers['set-cookie'] ?? []) as string[];
  const sessionCookieHeader = setCookies.find((c) =>
    c.startsWith('pulsar_admin_session='),
  );
  if (sessionCookieHeader === undefined) {
    throw new Error('Login did not issue a pulsar_admin_session cookie');
  }
  const cookie = sessionCookieHeader.split(';')[0];

  return {
    email,
    cookie,
    cleanup: async () => {
      await connection.collection('admin_users').deleteMany({ email });
      await connection.collection('admin_sessions').deleteMany({});
    },
  };
}
