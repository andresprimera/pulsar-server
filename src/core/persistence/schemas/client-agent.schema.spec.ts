import * as mongoose from 'mongoose';
import { Types } from 'mongoose';
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

describe('ClientAgentSchema webhookRegistration.status enum', () => {
  // Reaches into the schema to inspect the embedded HireChannelConfig schema
  // and asserts the WebhookRegistrationState.status enum is forward-only
  // extended per `docs/rules/data-modeling.md` (no removals once added).
  function getStatusEnum(): string[] {
    const channelsPathOptions = (ClientAgentSchema as any).path(
      'channels',
    ).options;
    const embeddedSchema =
      channelsPathOptions?.type?.[0] ??
      channelsPathOptions?.['type']?.[0] ??
      channelsPathOptions?.[0];
    const wrPath = (embeddedSchema as any).path('webhookRegistration');
    // The embedded webhookRegistration is itself a sub-schema.
    const wrSchema = (wrPath as any).schema ?? wrPath?.options?.type;
    const statusPath = (wrSchema as any).path('status');
    return statusPath.options.enum as string[];
  }

  it('accepts the five canonical status values', () => {
    const enumValues = getStatusEnum();
    for (const v of [
      'pending',
      'registering',
      'registered',
      'failed',
      'quarantined',
    ]) {
      expect(enumValues).toContain(v);
    }
  });

  it('does not list any status outside the canonical five (forward-only widening only)', () => {
    const enumValues = getStatusEnum();
    expect(enumValues).toHaveLength(5);
  });
});

describe('ClientAgentSchema webhookRegistration document validation', () => {
  // Mongoose `validateSync()` on a constructed sub-document path is the
  // mechanical guard against an accidental enum revert.
  let Model: any;

  beforeAll(() => {
    Model =
      (mongoose as any).models.ClientAgentSchemaSpecModel ??
      (mongoose as any).model('ClientAgentSchemaSpecModel', ClientAgentSchema);
  });

  function makeDoc(status: string) {
    return new Model({
      clientId: 'c-1',
      agentId: 'a-1',
      personalityId: new Types.ObjectId(),
      status: 'active',
      agentPricing: { amount: 0, currency: 'USD', monthlyTokenQuota: null },
      billingAnchor: new Date(),
      channels: [
        {
          channelId: new Types.ObjectId(),
          provider: 'telegram',
          status: 'active',
          currency: 'USD',
          webhookRegistration: { status, attemptCount: 0 },
        },
      ],
    });
  }

  for (const v of [
    'pending',
    'registering',
    'registered',
    'failed',
    'quarantined',
  ]) {
    it(`accepts webhookRegistration.status = '${v}'`, () => {
      const err = makeDoc(v).validateSync();
      // Other validation errors may exist (e.g. types), but none for the
      // status path under test.
      const flat = err ? JSON.stringify(err.errors) : '';
      expect(flat).not.toMatch(/webhookRegistration\.status/);
    });
  }

  it("rejects webhookRegistration.status = 'unknown'", () => {
    const err = makeDoc('unknown').validateSync();
    expect(err).toBeDefined();
    if (!err) throw new Error('expected validation error');
    expect(JSON.stringify(err.errors)).toMatch(/webhookRegistration\.status/);
  });
});
