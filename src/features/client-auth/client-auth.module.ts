import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientUsersService } from './client-users.service';
import { ClientSessionsService } from './client-sessions.service';
import { ClientAuthGuard } from './client-auth.guard';

@Module({
  controllers: [ClientAuthController],
  providers: [
    ClientUsersService,
    ClientSessionsService,
    ClientAuthService,
    ClientAuthGuard,
    { provide: APP_GUARD, useExisting: ClientAuthGuard },
  ],
  exports: [ClientAuthService, ClientUsersService],
})
export class ClientAuthModule {}
