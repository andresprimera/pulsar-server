import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from './admin-users.service';
import { AdminSessionsService } from './admin-sessions.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  controllers: [AdminAuthController],
  providers: [
    AdminUsersService,
    AdminSessionsService,
    AdminAuthService,
    AdminAuthGuard,
    { provide: APP_GUARD, useExisting: AdminAuthGuard },
  ],
  exports: [AdminAuthService, AdminUsersService],
})
export class AdminAuthModule {}
