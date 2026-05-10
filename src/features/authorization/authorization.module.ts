import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminAuthModule } from '@admin-auth/admin-auth.module';
import { ClientAuthModule } from '@client-auth/client-auth.module';
import { AdminAuthGuard } from '@admin-auth/admin-auth.guard';
import { ClientAuthGuard } from '@client-auth/client-auth.guard';
import { RolesGuard } from './roles.guard';
import { OwnsClientGuard } from './owns-client.guard';

/**
 * Single source of `APP_GUARD` registration. NestJS only guarantees
 * `APP_GUARD` execution order within one module's `providers` array; across
 * modules it is undefined. `AdminAuthModule` and `ClientAuthModule` therefore
 * export their guards (without registering them as `APP_GUARD`), and this
 * module composes the four into the contract-defined order:
 *
 *     AdminAuthGuard -> ClientAuthGuard -> RolesGuard -> OwnsClientGuard
 *
 * Authentication runs first; `RolesGuard` and `OwnsClientGuard` rely on the
 * principal already attached to the request by the auth guards.
 *
 * The architecture test `app-guard-single-source.spec.ts` asserts that
 * `APP_GUARD` is registered in exactly one module — this one.
 */
@Module({
  imports: [AdminAuthModule, ClientAuthModule],
  providers: [
    RolesGuard,
    OwnsClientGuard,
    { provide: APP_GUARD, useExisting: AdminAuthGuard },
    { provide: APP_GUARD, useExisting: ClientAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_GUARD, useExisting: OwnsClientGuard },
  ],
})
export class AuthorizationModule {}
