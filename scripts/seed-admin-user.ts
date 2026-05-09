import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AdminUsersService } from '../src/features/admin-auth/admin-users.service';

const REQUIRED_ENV = ['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'] as const;

async function main(): Promise<void> {
  for (const key of REQUIRED_ENV) {
    if (
      typeof process.env[key] !== 'string' ||
      process.env[key]?.length === 0
    ) {
      console.error(`Missing required env var: ${key}`);
      process.exit(1);
    }
  }

  const email = process.env.SEED_ADMIN_EMAIL as string;
  const password = process.env.SEED_ADMIN_PASSWORD as string;
  const displayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Admin';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const adminUsersService = app.get(AdminUsersService);
    const existing = await adminUsersService.findByEmail(email);
    if (existing !== null) {
      console.log(`Admin already provisioned for ${existing.email}; no-op.`);
      return;
    }

    await adminUsersService.create({ email, password, displayName });
    console.log(`Seeded admin: ${email}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
