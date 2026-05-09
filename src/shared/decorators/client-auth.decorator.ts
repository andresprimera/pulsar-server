import { SetMetadata } from '@nestjs/common';

export const IS_CLIENT_AUTH_KEY = 'isClientAuth';

/**
 * Marks a route or controller as requiring client-tier authentication.
 * The global admin auth guard short-circuits when this metadata is
 * present (admin guard does not enforce on client-auth routes), and
 * the client auth guard enforces only when this metadata is present.
 */
export const ClientAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_CLIENT_AUTH_KEY, true);
