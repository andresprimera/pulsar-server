const DEFAULT_MAX_LEN = 512;

export function redactLikelySecrets(input: string): string {
  let out = input;
  out = out.replace(/\bsk-[a-zA-Z0-9]{16,}\b/g, '[REDACTED_SK]');
  out = out.replace(/\bBearer\s+[a-zA-Z0-9._=-]{16,}\b/gi, '[REDACTED_BEARER]');
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]');
  out = out.replace(
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    '[REDACTED_EMAIL]',
  );
  return out;
}

export function clampToolLogString(
  input: string,
  maxLen: number = DEFAULT_MAX_LEN,
): string {
  if (input.length <= maxLen) {
    return input;
  }
  return `${input.slice(0, maxLen)}…[truncated]`;
}

export function sanitizeToolLogArgument(
  raw: string,
  maxLen: number = DEFAULT_MAX_LEN,
): string {
  return clampToolLogString(redactLikelySecrets(raw), maxLen);
}
