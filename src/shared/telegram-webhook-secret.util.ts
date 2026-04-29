import { createHash, timingSafeEqual } from 'crypto';

const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;

/**
 * Deterministic webhook secret for Telegram `setWebhook.secret_token`.
 * UTF-8 SHA-256 of the full bot token, lowercase hex (64 chars).
 */
export function deriveTelegramWebhookSecret(botToken: string): string {
  return createHash('sha256').update(botToken, 'utf8').digest('hex');
}

export function parseTelegramBotIdFromToken(botToken: string): string | null {
  if (!BOT_TOKEN_PATTERN.test(botToken)) {
    return null;
  }
  const prefix = botToken.split(':')[0];
  return prefix ?? null;
}

export function isValidTelegramBotTokenShape(botToken: string): boolean {
  return BOT_TOKEN_PATTERN.test(botToken);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8') as unknown as Uint8Array;
  const bb = Buffer.from(b, 'utf8') as unknown as Uint8Array;
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}
