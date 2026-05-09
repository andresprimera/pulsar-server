import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AdminPrincipal } from '@shared/types/express';

/**
 * Returns the authenticated `AdminPrincipal` attached by the admin auth guard.
 * Returns `undefined` for routes annotated `@Public()`.
 */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminPrincipal | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.adminUser;
  },
);
