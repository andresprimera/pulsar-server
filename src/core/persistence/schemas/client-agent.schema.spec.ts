import { ClientAgentSchema } from './client-agent.schema';

function getPreHooks(hookName: string): Array<(next: () => void) => void> {
  // Mongoose 7 stores middleware in schema.s.hooks._pres (Map<string, Function[]>).
  const hooks = (ClientAgentSchema as any).s?.hooks;
  const map: Map<string, any[]> | undefined = hooks?._pres;
  if (!map) return [];
  const entries = map.get(hookName) ?? [];
  return entries
    .map((entry: any) => entry?.fn ?? entry)
    .filter(
      (fn: unknown): fn is (next: () => void) => void =>
        typeof fn === 'function',
    );
}

function getTruncationHook(
  hookName: string,
): (next: () => void) => void | undefined {
  // Filter out mongoose-builtin timestamp hooks; pick our truncation one which
  // references the truncate helper or the literal lastError path.
  const fns = getPreHooks(hookName);
  const ours = fns.find((fn) => {
    const src = fn.toString();
    return (
      src.includes('truncateLastErrorOnDoc') ||
      src.includes('webhookRegistration') ||
      src.includes('lastError')
    );
  });
  if (!ours) {
    throw new Error(`No truncation pre-hook found for ${hookName}`);
  }
  return ours;
}

describe('ClientAgentSchema webhookRegistration.lastError truncation', () => {
  it('registers pre hooks for save, updateOne, findOneAndUpdate, updateMany', () => {
    expect(getPreHooks('save').length).toBeGreaterThan(0);
    expect(getPreHooks('updateOne').length).toBeGreaterThan(0);
    expect(getPreHooks('findOneAndUpdate').length).toBeGreaterThan(0);
    expect(getPreHooks('updateMany').length).toBeGreaterThan(0);
  });

  it('truncates oversized lastError on save (document path)', () => {
    const longErr = 'x'.repeat(5_000);
    const channels = [
      {
        webhookRegistration: { status: 'failed', lastError: longErr },
      },
    ];
    const fn = getTruncationHook('save');
    const ctx: any = { channels };
    fn.call(ctx, () => undefined);
    expect(channels[0].webhookRegistration.lastError.length).toBe(500);
  });

  it('truncates oversized lastError on findOneAndUpdate ($ path)', () => {
    const longErr = 'y'.repeat(5_000);
    const update = {
      $set: { 'channels.$.webhookRegistration.lastError': longErr },
    };
    const fn = getTruncationHook('findOneAndUpdate');
    const queryCtx: any = { getUpdate: () => update };
    fn.call(queryCtx, () => undefined);
    expect(update.$set['channels.$.webhookRegistration.lastError'].length).toBe(
      500,
    );
  });

  it('truncates oversized lastError on updateOne ($[id] arrayFilters path)', () => {
    const longErr = 'z'.repeat(5_000);
    const update = {
      $set: { 'channels.$[ch].webhookRegistration.lastError': longErr },
    };
    const fn = getTruncationHook('updateOne');
    const queryCtx: any = { getUpdate: () => update };
    fn.call(queryCtx, () => undefined);
    expect(
      update.$set['channels.$[ch].webhookRegistration.lastError'].length,
    ).toBe(500);
  });

  it('truncates oversized lastError on updateMany (numeric path)', () => {
    const longErr = 'q'.repeat(5_000);
    const update = {
      $set: { 'channels.0.webhookRegistration.lastError': longErr },
    };
    const fn = getTruncationHook('updateMany');
    const queryCtx: any = { getUpdate: () => update };
    fn.call(queryCtx, () => undefined);
    expect(update.$set['channels.0.webhookRegistration.lastError'].length).toBe(
      500,
    );
  });

  it('keeps short lastError unchanged', () => {
    const update = {
      $set: { 'channels.0.webhookRegistration.lastError': 'short message' },
    };
    const fn = getTruncationHook('updateOne');
    const queryCtx: any = { getUpdate: () => update };
    fn.call(queryCtx, () => undefined);
    expect(update.$set['channels.0.webhookRegistration.lastError']).toBe(
      'short message',
    );
  });
});
