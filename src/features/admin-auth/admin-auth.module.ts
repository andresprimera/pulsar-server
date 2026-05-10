import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from './admin-users.service';
import { AdminUserSeederService } from './admin-user-seeder.service';
import { AdminSessionsService } from './admin-sessions.service';
import { AdminAuthGuard } from './admin-auth.guard';

/**
 * `AdminAuthGuard` is exported (not self-registered as `APP_GUARD`) so
 * `AuthorizationModule` can register it as the first guard in the global
 * pipeline. See `features/authorization/authorization.module.ts`.
 */
@Module({
  controllers: [AdminAuthController],
  providers: [
    AdminUsersService,
    AdminSessionsService,
    AdminAuthService,
    AdminAuthGuard,
    AdminUserSeederService,
  ],
  exports: [AdminAuthService, AdminUsersService, AdminAuthGuard],
})
export class AdminAuthModule {}
