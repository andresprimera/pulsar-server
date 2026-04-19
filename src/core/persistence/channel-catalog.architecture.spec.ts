import {
  CHANNEL_CATALOG,
  TRANSPORT_IMPLEMENTED_CHANNEL_TYPES,
} from './channel-catalog';
import { CHANNEL_TYPES } from '@shared/channel-type.constants';
import {
  CHANNEL_PROVIDER_VALUES,
  type ChannelProviderValue,
} from '@shared/channel-provider.constants';

describe('Channel catalog (architecture invariants)', () => {
  it('uses unique channel display names', () => {
    const names = CHANNEL_CATALOG.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only references known channel kinds', () => {
    const allowed = new Set(CHANNEL_TYPES);
    for (const entry of CHANNEL_CATALOG) {
      expect(allowed.has(entry.type)).toBe(true);
    }
  });

  it('includes every transport-backed channel kind (AppModule)', () => {
    for (const transportType of TRANSPORT_IMPLEMENTED_CHANNEL_TYPES) {
      expect(CHANNEL_CATALOG.some((c) => c.type === transportType)).toBe(true);
    }
  });

  it('lists supported providers that exist in CHANNEL_PROVIDER_VALUES', () => {
    const allowed = new Set<ChannelProviderValue>(CHANNEL_PROVIDER_VALUES);
    for (const entry of CHANNEL_CATALOG) {
      for (const p of entry.supportedProviders) {
        const normalized = p.toLowerCase() as ChannelProviderValue;
        expect(allowed.has(normalized)).toBe(true);
      }
    }
  });
});
