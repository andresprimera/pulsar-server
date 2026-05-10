import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import { OWNS_CLIENT_METADATA_KEY } from '@shared/decorators/owns-client.decorator';

/**
 * Tenant-isolation guard for `:clientId` routes. Rejects any request whose
 * authenticated `request.clientUser.clientId` does not match the value at
 * `request.params[paramName]`.
 *
 * Admin-tier requests (`request.clientUser` undefined; `request.adminUser`
 * present) bypass the check entirely — the super-admin operating model
 * requires admins to read across clients.
 *
 * Public routes short-circuit. Routes without `@OwnsClient(...)` metadata
 * pass through unchanged (the architecture test
 * `clientid-routes-have-owns-client.spec.ts` enforces decorator presence on
 * `:clientId` client-tier routes; this guard does not enforce structural
 * invariants).
 */
@Injectable()
export class OwnsClientGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const paramName = this.reflector.getAllAndOverride<string>(
      OWNS_CLIENT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (paramName === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Admin-tier bypass: admins are not bound to a specific client.
    if (request.clientUser === undefined) {
      return true;
    }

    const paramValue = request.params?.[paramName];
    if (typeof paramValue !== 'string' || paramValue.length === 0) {
      throw new ForbiddenException('Missing :clientId param');
    }

    if (String(paramValue) !== String(request.clientUser.clientId)) {
      throw new ForbiddenException('Cross-client access denied');
    }
    return true;
  }
}
