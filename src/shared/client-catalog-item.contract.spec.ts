import {
  clientCatalogItemUpsertSchema,
  stableSerializeCatalogItem,
} from './client-catalog-item.contract';

describe('clientCatalogItemUpsertSchema', () => {
  it('accepts minimal product row', () => {
    const row = clientCatalogItemUpsertSchema.parse({
      sku: ' A1 ',
      name: 'Widget',
      type: 'product',
    });
    expect(row.sku).toBe('A1');
    expect(row.name).toBe('Widget');
  });

  it('requires currency when price is set', () => {
    expect(() =>
      clientCatalogItemUpsertSchema.parse({
        sku: 'x',
        name: 'y',
        type: 'service',
        unitAmountMinor: 100,
      }),
    ).toThrow();
  });

  it('stableSerialize matches for equivalent rows', () => {
    const a = clientCatalogItemUpsertSchema.parse({
      sku: 's',
      name: 'n',
      type: 'product',
      currency: 'usd',
    });
    const b = clientCatalogItemUpsertSchema.parse({
      sku: 's',
      name: 'n',
      type: 'product',
      currency: 'USD',
    });
    expect(stableSerializeCatalogItem(a)).toBe(stableSerializeCatalogItem(b));
  });
});
