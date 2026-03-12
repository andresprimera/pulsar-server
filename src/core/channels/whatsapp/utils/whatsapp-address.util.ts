const WHATSAPP_PREFIX = 'whatsapp:';

export function ensureWhatsAppPrefix(value: string): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith(WHATSAPP_PREFIX)) return trimmed;
  return WHATSAPP_PREFIX + trimmed;
}

export function stripWhatsAppPrefix(value: string): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith(WHATSAPP_PREFIX)) {
    return trimmed.slice(WHATSAPP_PREFIX.length);
  }
  return trimmed;
}

/**
 * Ensures a phone number has a leading + for E.164 (so routing lookup matches DB-stored values).
 * Idempotent if already E.164; adds + when value is digits-only.
 */
export function normalizeToE164(value: string): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (/^\d+$/.test(trimmed)) return '+' + trimmed;
  return trimmed;
}
