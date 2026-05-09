import type { CookieOptions } from 'express';

export const CLIENT_SESSION_COOKIE_NAME = 'pulsar_client_session';

/**
 * Single source of truth for client session cookie attributes. Used by both
 * `res.cookie(...)` on login and `res.clearCookie(...)` on logout to
 * guarantee flag parity (browsers refuse to delete a cookie when the clear
 * flags do not match the set flags).
 *
 * Note: `maxAge` is intentionally omitted here so callers must supply it
 * at the call site from `clientSessionsService.getAbsoluteTtlMs()`.
 */
export const getClientSessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});
