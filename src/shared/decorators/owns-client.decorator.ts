import { SetMetadata } from '@nestjs/common';

export const OWNS_CLIENT_METADATA_KEY = 'ownsClientParam';

/**
 * Marks a client-tier route whose path includes a `:clientId` param as
 * tenant-scoped: `OwnsClientGuard` rejects with 403 unless the authenticated
 * `request.clientUser.clientId` equals the value at `request.params[paramName]`.
 *
 * Admin-tier requests bypass `OwnsClientGuard` entirely (super-admin
 * operating model — admins must be able to read across clients).
 *
 * Default param name is `'clientId'` so the common case is `@OwnsClient()`.
 * Long form `@OwnsClient('someOtherParam')` supported for routes that name
 * the param differently.
 *
 * The architecture test `clientid-routes-have-owns-client.spec.ts` enforces
 * that every `@ClientAuth()` handler whose path contains `:clientId` carries
 * `@OwnsClient(...)` or `@Public()`.
 */
export const OwnsClient = (
  paramName = 'clientId',
): MethodDecorator & ClassDecorator =>
  SetMetadata(OWNS_CLIENT_METADATA_KEY, paramName);
