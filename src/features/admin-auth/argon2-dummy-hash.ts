import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

let cachedDummyHash: Promise<string> | null = null;

/**
 * Returns a stable argon2id hash used to equalize wall-clock time on the
 * "unknown email" branch of the login flow. Computed once per process
 * with library defaults so the dummy verify and the real verify draw
 * from the same parameter set; if argon2 defaults change, the dummy
 * follows automatically.
 *
 * The plaintext used to seed the dummy is randomized at module load and
 * never matches a real password — calling argon2.verify against this
 * hash with any user-supplied password will always return false.
 */
export const getArgon2DummyHash = (): Promise<string> => {
  if (cachedDummyHash === null) {
    cachedDummyHash = argon2.hash(randomBytes(32).toString('base64'), {
      type: argon2.argon2id,
    });
  }
  return cachedDummyHash;
};
