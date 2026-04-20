import { isMongoDuplicateKeyError } from './mongo-duplicate-key.util';

describe('isMongoDuplicateKeyError', () => {
  it('returns true for code 11000', () => {
    expect(isMongoDuplicateKeyError({ code: 11000 })).toBe(true);
  });

  it('returns false for other codes and non-objects', () => {
    expect(isMongoDuplicateKeyError({ code: 1 })).toBe(false);
    expect(isMongoDuplicateKeyError(null)).toBe(false);
    expect(isMongoDuplicateKeyError('x')).toBe(false);
  });
});
