import { AdminSessionSchema } from './admin-session.schema';

describe('AdminSessionSchema', () => {
  it('truncates userAgent values longer than 512 characters via the schema setter', () => {
    const userAgentPath = AdminSessionSchema.path('userAgent') as unknown as {
      applySetters: (value: unknown) => unknown;
    };

    const oversized = 'A'.repeat(2_000);
    const stored = userAgentPath.applySetters(oversized);

    expect(typeof stored).toBe('string');
    expect((stored as string).length).toBe(512);
  });

  it('passes through short userAgent values unchanged', () => {
    const userAgentPath = AdminSessionSchema.path('userAgent') as unknown as {
      applySetters: (value: unknown) => unknown;
    };

    const shortish = 'Mozilla/5.0';
    const stored = userAgentPath.applySetters(shortish);

    expect(stored).toBe(shortish);
  });

  it('declares a TTL index on expiresAt', () => {
    const indexes = AdminSessionSchema.indexes();
    const ttlIndex = indexes.find(
      ([fields, options]) =>
        (fields as Record<string, number>).expiresAt === 1 &&
        (options as Record<string, unknown> | undefined)?.expireAfterSeconds ===
          0,
    );
    expect(ttlIndex).toBeDefined();
  });

  it('declares a unique index on tokenHash', () => {
    const indexes = AdminSessionSchema.indexes();
    const tokenHashIndex = indexes.find(
      ([fields, options]) =>
        (fields as Record<string, number>).tokenHash === 1 &&
        (options as Record<string, unknown> | undefined)?.unique === true,
    );
    expect(tokenHashIndex).toBeDefined();
  });
});
