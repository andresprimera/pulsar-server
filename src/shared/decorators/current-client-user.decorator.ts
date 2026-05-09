import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ClientUserPrincipal } from '@shared/types/express';

/**
 * Returns the authenticated `ClientUserPrincipal` attached by the client
 * auth guard. Returns `undefined` for routes annotated `@Public()` or
 * routes that did not request client auth.
 */
export const CurrentClientUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ClientUserPrincipal | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.clientUser;
  },
);
