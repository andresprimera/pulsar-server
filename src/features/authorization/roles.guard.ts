import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import { IS_CLIENT_AUTH_KEY } from '@shared/decorators/client-auth.decorator';
import { ROLES_METADATA_KEY } from '@shared/decorators/roles.decorator';
import { CLIENT_ROLES_METADATA_KEY } from '@shared/decorators/client-roles.decorator';
import type { AdminRole } from '@shared/auth/admin-roles';
import type { ClientRole } from '@shared/auth/client-roles';

/**
 * Authorizes admin-tier and client-tier routes against role metadata
 * declared via `@Roles(...)` / `@ClientRoles(...)`.
 *
 * Tier disambiguation: routes tagged `@ClientAuth()` (`IS_CLIENT_AUTH_KEY`)
 * are client-tier; otherwise admin-tier.
 *
 * Default-deny:
 * - admin route with no `@Roles(...)` → `['super_admin']`
 * - client route with no `@ClientRoles(...)` → `['owner']`
 *
 * Public routes (`@Public()`) short-circuit — neither tier nor role checks
 * apply. Authentication has already run in `AdminAuthGuard` /
 * `ClientAuthGuard` (registered earlier in `APP_GUARD` order); this guard
 * reads the principal off the request without re-querying the DB.
 *
 * Single private `isAllowed` helper prevents admin/client branch drift.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const isClientAuth = this.reflector.getAllAndOverride<boolean>(
      IS_CLIENT_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isClientAuth === true) {
      const allowed =
        this.reflector.getAllAndOverride<ClientRole[]>(
          CLIENT_ROLES_METADATA_KEY,
          [context.getHandler(), context.getClass()],
        ) ?? (['owner'] as ClientRole[]);
      const principal = request.clientUser;
      if (principal === undefined) {
        // Defense-in-depth: ClientAuthGuard should have rejected by now.
        throw new ForbiddenException('Insufficient role');
      }
      if (!this.isAllowed(allowed, principal.clientRole)) {
        throw new ForbiddenException('Insufficient role');
      }
      return true;
    }

    // Admin tier
    const allowed =
      this.reflector.getAllAndOverride<AdminRole[]>(ROLES_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? (['super_admin'] as AdminRole[]);
    const principal = request.adminUser;
    if (principal === undefined) {
      // Defense-in-depth: AdminAuthGuard should have rejected by now.
      throw new ForbiddenException('Insufficient role');
    }
    if (!this.isAllowed(allowed, principal.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }

  private isAllowed<R extends string>(
    allowedRoles: readonly R[],
    principalRole: R | undefined,
  ): boolean {
    if (principalRole === undefined) {
      return false;
    }
    return allowedRoles.includes(principalRole);
  }
}
