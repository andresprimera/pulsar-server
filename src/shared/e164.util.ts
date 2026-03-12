/**
 * Normalizes a phone number to E.164 format (with leading +).
 * Used when saving and when matching so DB and routing use a single canonical form.
 * Idempotent: values already starting with + are returned unchanged; digits-only get + prepended.
 */
export function normalizeToE164(value: string): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (/^\d+$/.test(trimmed)) return '+' + trimmed;
  return trimmed;
}
