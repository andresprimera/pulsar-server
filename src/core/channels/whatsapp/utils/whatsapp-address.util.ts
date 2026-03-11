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
