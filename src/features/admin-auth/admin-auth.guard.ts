import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import { IS_CLIENT_AUTH_KEY } from '@shared/decorators/client-auth.decorator';
import { ADMIN_SESSION_COOKIE_NAME } from './session-cookie-options';
import { AdminSessionsService } from './admin-sessions.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminSessionsService: AdminSessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const isClientAuth = this.reflector.getAllAndOverride<boolean>(
      IS_CLIENT_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isClientAuth === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = this.extractCookieToken(request);
    if (rawToken === null) {
      throw new UnauthorizedException('Authentication required');
    }

    const validated = await this.adminSessionsService.validateAndTouch(
      rawToken,
    );
    if (validated === null) {
      throw new UnauthorizedException('Authentication required');
    }

    request.adminUser = {
      adminUserId: validated.admin.id,
      sessionId: validated.session.id,
      email: validated.admin.email,
      status: validated.admin.status,
      role: validated.admin.role,
    };
    return true;
  }

  private extractCookieToken(request: Request): string | null {
    const cookies = (
      request as Request & {
        cookies?: Record<string, string | undefined>;
      }
    ).cookies;
    if (cookies === undefined || cookies === null) {
      return null;
    }
    const raw = cookies[ADMIN_SESSION_COOKIE_NAME];
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    return raw;
  }
}
