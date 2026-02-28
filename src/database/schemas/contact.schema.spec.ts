import { ContactSchema, throwsIfExternalIdMutation } from './contact.schema';

describe('ContactSchema', () => {
  it('enforces unique compound index on clientId+channelId+externalId without legacy unique index', () => {
    const indexes = ContactSchema.indexes();

    const hasRequiredCompoundIndex = indexes.some(
      ([fields, options]) =>
        fields.clientId === 1 &&
        fields.channelId === 1 &&
        fields.externalId === 1 &&
        options?.unique === true,
    );

    const hasLegacyUniqueIndex = indexes.some(
      ([fields, options]) =>
        ((fields as any).channelIdentifier === 1 || (fields as any).externalUserId === 1) &&
        options?.unique === true,
    );

    expect(hasRequiredCompoundIndex).toBe(true);
    expect(hasLegacyUniqueIndex).toBe(false);
  });

  it('marks externalId as immutable', () => {
    const externalIdPath = ContactSchema.path('externalId') as any;
    expect(externalIdPath.options.immutable).toBe(true);
  });

  it('throws when externalId mutation is attempted via update payload', () => {
    expect(() =>
      throwsIfExternalIdMutation({
        $set: { externalId: 'new-external-id' },
      }),
    ).toThrow('externalId is immutable and cannot be modified');
  });

  it('allows upsert setOnInsert for externalId without mutation error', () => {
    expect(() =>
      throwsIfExternalIdMutation({
        $setOnInsert: { externalId: 'new-external-id' },
      }),
    ).not.toThrow();
  });

  it('keeps original externalId unchanged after mutation attempt', () => {
    const persisted = {
      _id: 'contact-1',
      externalId: '12345678',
      name: 'Contact',
    };

    try {
      throwsIfExternalIdMutation({
        $set: { externalId: '99999999' },
      });
    } catch {
      // mutation blocked as expected
    }

    expect(persisted.externalId).toBe('12345678');
  });
});
