import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Uint8Array {
  const hex = process.env.SECRET_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'SECRET_ENCRYPTION_KEY env variable is required. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a portable string: iv.tag.ciphertext (hex-encoded).
 */
export function encrypt(text: string): string {
  if (process.env.NODE_ENV !== 'production') {
    return text;
  }

  const key = getKey();
  const iv = new Uint8Array(randomBytes(16));
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const updated = new Uint8Array(cipher.update(text, 'utf8') as Buffer);
  const final = new Uint8Array(cipher.final() as Buffer);
  const encrypted = new Uint8Array([...updated, ...final]);

  const tag = new Uint8Array(cipher.getAuthTag() as Buffer);

  return `${Buffer.from(iv).toString('hex')}.${Buffer.from(tag).toString(
    'hex',
  )}.${Buffer.from(encrypted).toString('hex')}`;
}

/**
 * Decrypt a payload previously produced by encrypt().
 */
export function decrypt(payload: string): string {
  if (process.env.NODE_ENV !== 'production') {
    return payload;
  }

  const key = getKey();
  const [ivHex, tagHex, encryptedHex] = payload.split('.');

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    new Uint8Array(Buffer.from(ivHex, 'hex')),
  );

  decipher.setAuthTag(new Uint8Array(Buffer.from(tagHex, 'hex')));

  const updated = new Uint8Array(
    decipher.update(new Uint8Array(Buffer.from(encryptedHex, 'hex'))) as Buffer,
  );
  const final = new Uint8Array(decipher.final() as Buffer);
  const decrypted = new Uint8Array([...updated, ...final]);

  return Buffer.from(decrypted).toString('utf8');
}

/**
 * Encrypt all string values in an object (shallow, one level deep).
 * Useful for encrypting credentials records before saving.
 */
export function encryptRecord(
  record: Record<string, any>,
): Record<string, any> {
  const encrypted: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    encrypted[k] = typeof v === 'string' ? encrypt(v) : v;
  }
  return encrypted;
}

/**
 * Check if a string looks like an AES-256-GCM encrypted payload.
 * Format: iv(32 hex).tag(32 hex).ciphertext(hex) — exactly 2 dots.
 */
function isEncryptedPayload(value: string): boolean {
  return /^[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9a-f]+$/i.test(value);
}

/**
 * Decrypt all string values in an object (shallow, one level deep).
 * Only attempts to decrypt values that match the AES-256-GCM encrypted format.
 */
export function decryptRecord(
  record: Record<string, any>,
): Record<string, any> {
  const decrypted: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    decrypted[k] =
      typeof v === 'string' && isEncryptedPayload(v) ? decrypt(v) : v;
  }
  return decrypted;
}
