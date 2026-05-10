import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

@Injectable()
export class AdminUserSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminUserSeederService.name);

  constructor(private readonly adminUsersService: AdminUsersService) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = process.env.SEED_ADMIN_EMAIL?.trim();
    const password = process.env.SEED_ADMIN_PASSWORD;
    const displayName =
      process.env.SEED_ADMIN_NAME?.trim() ||
      this.deriveDisplayNameFromEmail(email);

    if (!email || !password) {
      this.logger.log(
        'Skipping admin user seeding (SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set)',
      );
      return;
    }

    const existing = await this.adminUsersService.findByEmail(email);
    if (existing !== null) {
      this.logger.log(`Admin user "${email}" already exists. Skipping.`);
      return;
    }

    try {
      const created = await this.adminUsersService.create({
        email,
        password,
        displayName,
        role: 'super_admin',
      });
      this.logger.log(`Seeded admin user "${created.email}" (${created._id})`);
    } catch (error) {
      this.logger.error(`Failed to seed admin user "${email}"`, error as Error);
      throw error;
    }
  }

  private deriveDisplayNameFromEmail(email: string | undefined): string {
    if (!email) return 'Admin';
    const localPart = email.split('@')[0] ?? 'Admin';
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }
}
