import { Types } from 'mongoose';
import { Logger } from '@nestjs/common';
// eslint-disable-next-line boundaries/element-types -- TODO: domain→persistence violation, tracked for refactor
import { ContactRepository } from '@persistence/repositories/contact.repository';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { ContactIdentifierExtractorRegistry } from './contact-identifier-extractor.registry';
import { WhatsappIdentifierExtractor } from './whatsapp-identifier.extractor';
import { InstagramIdentifierExtractor } from './instagram-identifier.extractor';
import { TelegramIdentifierExtractor } from './telegram-identifier.extractor';
import { TiktokIdentifierExtractor } from './tiktok-identifier.extractor';
import { WebIdentifierExtractor } from './web-identifier.extractor';
import { ApiIdentifierExtractor } from './api-identifier.extractor';
import {
  ExtractorNotFoundException,
  InvalidIdentifierException,
} from './contact-identifier.exceptions';

type Query<T> = {
  session: (_session?: unknown) => Query<T>;
  exec: () => Promise<T>;
};

class InMemoryContactModel {
  private store = new Map<string, any>();

  private key(clientId: any, channelId: any, externalId: any): string {
    return `${clientId.toString()}:${channelId.toString()}:${externalId}`;
  }

  private wrap<T>(producer: () => T | Promise<T>): Query<T> {
    return {
      session: () => this.wrap(producer),
      exec: async () => producer(),
    };
  }

  findById(id: string): Query<any | null> {
    return this.wrap(() => {
      for (const value of this.store.values()) {
        if (value._id.toString() === id) {
          return value;
        }
      }

      return null;
    });
  }

  find(filter: any): Query<any[]> {
    return this.wrap(() => {
      const all = Array.from(this.store.values());
      if (!filter?.clientId) {
        return all;
      }

      return all.filter(
        (item) => item.clientId.toString() === filter.clientId.toString(),
      );
    });
  }

  findOne(filter: any): Query<any | null> {
    return this.wrap(() => {
      const key = this.key(
        filter.clientId,
        filter.channelId,
        filter.externalId,
      );
      return this.store.get(key) ?? null;
    });
  }

  findOneAndUpdate(filter: any, update: any): Query<any> {
    return this.wrap(() => {
      const key = this.key(
        filter.clientId,
        filter.channelId,
        filter.externalId,
      );
      const existing = this.store.get(key);
      if (existing) {
        return existing;
      }

      const created = {
        _id: new Types.ObjectId(),
        ...update.$setOnInsert,
      };

      this.store.set(key, created);
      return created;
    });
  }

  count(): number {
    return this.store.size;
  }
}

describe('Contact Identifier Architecture', () => {
  let repository: ContactRepository;
  let registry: ContactIdentifierExtractorRegistry;
  let model: InMemoryContactModel;

  const clientId = new Types.ObjectId();
  const whatsappChannelId = new Types.ObjectId();
  const instagramChannelId = new Types.ObjectId();

  beforeEach(() => {
    model = new InMemoryContactModel();
    repository = new ContactRepository(model as any);
    registry = new ContactIdentifierExtractorRegistry([
      new WhatsappIdentifierExtractor(),
      new InstagramIdentifierExtractor(),
      new TelegramIdentifierExtractor(),
      new TiktokIdentifierExtractor(),
      new WebIdentifierExtractor(),
      new ApiIdentifierExtractor(),
    ]);
  });

  it('creates different contacts for same phone across different channels', async () => {
    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '+1 415 555 0123' }],
              },
            },
          ],
        },
      ],
    });

    const whatsappContact = await repository.findOrCreateByExternalIdentity(
      clientId,
      whatsappChannelId,
      identifier.externalId,
      identifier.externalIdRaw,
      identifier.identifierType,
      'Phone User',
    );

    const instagramContact = await repository.findOrCreateByExternalIdentity(
      clientId,
      instagramChannelId,
      identifier.externalId,
      identifier.externalIdRaw,
      'platform_id',
      'Same User Other Channel',
    );

    expect(whatsappContact._id.toString()).not.toEqual(
      instagramContact._id.toString(),
    );
  });

  it('creates only one contact for same identifier on same channel and same client', async () => {
    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '+1 (415) 555-0123' }],
              },
            },
          ],
        },
      ],
    });

    const first = await repository.findOrCreateByExternalIdentity(
      clientId,
      whatsappChannelId,
      identifier.externalId,
      identifier.externalIdRaw,
      identifier.identifierType,
      'A',
    );

    const second = await repository.findOrCreateByExternalIdentity(
      clientId,
      whatsappChannelId,
      identifier.externalId,
      identifier.externalIdRaw,
      identifier.identifierType,
      'B',
    );

    expect(first._id.toString()).toEqual(second._id.toString());
    expect(model.count()).toBe(1);
  });

  it('normalizes instagram case differences to same identifier', async () => {
    const firstIdentifier = registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
      entry: [{ messaging: [{ sender: { id: 'User_ABC' } }] }],
    });

    const secondIdentifier = registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
      entry: [{ messaging: [{ sender: { id: ' user_abc ' } }] }],
    });

    expect(firstIdentifier.externalId).toEqual(secondIdentifier.externalId);

    const first = await repository.findOrCreateByExternalIdentity(
      clientId,
      instagramChannelId,
      firstIdentifier.externalId,
      firstIdentifier.externalIdRaw,
      firstIdentifier.identifierType,
      'IG User',
    );

    const second = await repository.findOrCreateByExternalIdentity(
      clientId,
      instagramChannelId,
      secondIdentifier.externalId,
      secondIdentifier.externalIdRaw,
      secondIdentifier.identifierType,
      'IG User Variant',
    );

    expect(first._id.toString()).toEqual(second._id.toString());
  });

  it('normalizes whatsapp identifiers with and without plus to same identifier', async () => {
    const withPlus = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '+1 415 555 0123' }],
              },
            },
          ],
        },
      ],
    });

    const withoutPlus = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '14155550123' }],
              },
            },
          ],
        },
      ],
    });

    expect(withPlus.externalId).toEqual(withoutPlus.externalId);
  });

  it('is safe under concurrent upsert attempts for same identity', async () => {
    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '+1 415 555 0123' }],
              },
            },
          ],
        },
      ],
    });

    const contacts = await Promise.all(
      Array.from({ length: 20 }).map(() =>
        repository.findOrCreateByExternalIdentity(
          clientId,
          whatsappChannelId,
          identifier.externalId,
          identifier.externalIdRaw,
          identifier.identifierType,
          'Concurrent User',
        ),
      ),
    );

    const ids = new Set(contacts.map((item) => item._id.toString()));
    expect(ids.size).toBe(1);
    expect(model.count()).toBe(1);
  });

  it('rejects whatsapp number shorter than 8 digits', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: '+1234567' }],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects whatsapp number longer than 15 digits', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: '+1234567890123456' }],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects whatsapp number containing only symbols', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: '+-()' }],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('logs whatsapp validation failure without leaking raw value', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() =>
      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: '+-()' }],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(InvalidIdentifierException);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('event=contact_identifier_validation_failed'),
    );
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes('+-()')),
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('rejects instagram empty username after trim', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
        entry: [{ messaging: [{ sender: { id: '   ' } }] }],
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects telegram identifier when id and username are missing', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
        message: {
          from: {},
        },
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects non-numeric telegram id', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
        message: {
          from: {
            id: '12ab45',
          },
        },
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects too-short telegram id', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
        message: {
          from: {
            id: '1234',
          },
        },
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects telegram username that starts with number', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
        message: {
          from: {
            username: '1validname',
          },
        },
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('rejects telegram username with invalid characters', () => {
    expect(() =>
      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
        message: {
          from: {
            username: 'valid-name',
          },
        },
      }),
    ).toThrow(InvalidIdentifierException);

    expect(model.count()).toBe(0);
  });

  it('accepts valid telegram id', () => {
    const identifier = registry.resolve(CHANNEL_TYPES.TELEGRAM, {
      message: {
        from: {
          id: '1234567890',
        },
      },
    });

    expect(identifier.externalId).toBe('1234567890');
  });

  it('accepts valid telegram username', () => {
    const identifier = registry.resolve(CHANNEL_TYPES.TELEGRAM, {
      message: {
        from: {
          username: 'valid_name123',
        },
      },
    });

    expect(identifier.externalId).toBe('valid_name123');
  });

  it('keeps upsert behavior for valid whatsapp identifier and avoids duplicates', async () => {
    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '+14155550123' }],
              },
            },
          ],
        },
      ],
    });

    const first = await repository.findOrCreateByExternalIdentity(
      clientId,
      whatsappChannelId,
      identifier.externalId,
      identifier.externalIdRaw,
      identifier.identifierType,
      'Regression User',
    );

    const second = await repository.findOrCreateByExternalIdentity(
      clientId,
      whatsappChannelId,
      identifier.externalId,
      identifier.externalIdRaw,
      identifier.identifierType,
      'Regression User Again',
    );

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first._id.toString()).toBe(second._id.toString());
    expect(model.count()).toBe(1);
  });

  it('throws explicit exception when no extractor supports channel type', () => {
    expect(() => registry.resolve('sms' as any, {})).toThrow(
      ExtractorNotFoundException,
    );
    expect(model.count()).toBe(0);
  });
});
