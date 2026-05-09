import type { CookieOptions } from 'express';

export const ADMIN_SESSION_COOKIE_NAME = 'pulsar_admin_session';

/**
 * Single source of truth for admin session cookie attributes. Used by both
 * `res.cookie(...)` on login and `res.clearCookie(...)` on logout to
 * guarantee flag parity (browsers refuse to delete a cookie when the clear
 * flags do not match the set flags).
 */
export const getSessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});
