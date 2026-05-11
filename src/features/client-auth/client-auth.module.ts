import { Module } from '@nestjs/common';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientUsersService } from './client-users.service';
import { ClientSessionsService } from './client-sessions.service';
import { ClientAuthGuard } from './client-auth.guard';

/**
 * `ClientAuthGuard` is exported (not self-registered as `APP_GUARD`) so
 * `AuthorizationModule` can register it as the second guard in the global
 * pipeline. See `features/authorization/authorization.module.ts`.
 */
@Module({
  controllers: [ClientAuthController],
  providers: [
    ClientUsersService,
    ClientSessionsService,
    ClientAuthService,
    ClientAuthGuard,
  ],
  exports: [ClientAuthService, ClientUsersService, ClientAuthGuard],
})
export class ClientAuthModule {}
