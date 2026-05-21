import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Contact } from '@persistence/schemas/contact.schema';
import { ContactIdentifierType } from '@persistence/schemas/contact.schema';

/**
 * Phase 5 — cursor shape for `findInboxContactsPage`. Same `(t, i)`
 * encoding the Phase 1 cursor codec produces; the timestamp is
 * `Contact.updatedAt` (the sort key) and `i` is `Contact._id` for
 * stable same-millisecond tiebreaking.
 */
export interface InboxContactsCursor {
  t: Date;
  i: Types.ObjectId;
}

/**
 * Phase 5 — slim contact row returned by `findInboxContactsPage`. The
 * projection carries only the fields the inbox `/contacts` endpoint
 * needs to build `InboxContactDto` (with side joins on `Channel.type`
 * and `Conversation` aggregation). Everything else stays on disk.
 */
export interface InboxContactRow {
  _id: Types.ObjectId;
  name: string;
  identifier?: { type: ContactIdentifierType; value: string };
  channelId: Types.ObjectId;
  updatedAt: Date;
}

export interface InboxContactsPageResult {
  items: InboxContactRow[];
  nextCursor: InboxContactsCursor | null;
}

@Injectable()
export class ContactRepository {
  private readonly logger = new Logger(ContactRepository.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly model: Model<Contact>,
  ) {}

  async findById(id: string): Promise<Contact | null> {
    return this.model.findById(id).exec();
  }

  async findByClient(clientId: Types.ObjectId): Promise<Contact[]> {
    return this.model.find({ clientId }).exec();
  }

  async findByExternalIdentity(
    clientId: Types.ObjectId,
    channelId: Types.ObjectId,
    externalId: string,
  ): Promise<Contact | null> {
    return this.model.findOne({ clientId, channelId, externalId }).exec();
  }

  async findOrCreateByExternalIdentity(
    clientId: Types.ObjectId,
    channelId: Types.ObjectId,
    externalId: string,
    externalIdRaw: string | undefined,
    identifierType: ContactIdentifierType,
    name: string,
    metadata?: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<Contact> {
    const filter = { clientId, channelId, externalId };
    const setOnInsert = {
      clientId,
      channelId,
      externalId,
      externalIdRaw,
      identifier: {
        type: identifierType,
        value: externalId,
      },
      name,
      metadata: metadata ?? {},
      status: 'active',
    };

    try {
      const contact = await this.model
        .findOneAndUpdate(
          filter,
          { $setOnInsert: setOnInsert },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true,
            ...(session && { session }),
          },
        )
        .exec();

      this.logger.log(
        `event=contact_upsert_success clientId=${clientId.toString()} channelId=${channelId.toString()}`,
      );

      return contact as Contact;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(
          `event=contact_duplicate_key_retry clientId=${clientId.toString()} channelId=${channelId.toString()}`,
        );

        const retryQuery = this.model.findOne(filter);
        const existing = await (session
          ? retryQuery.session(session)
          : retryQuery
        ).exec();
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as any).code === 11000
    );
  }

  /**
   * Phase 5 — tenant-scoped paginated read of contacts for the inbox
   * `/contacts` endpoint.
   *
   * Filter: `{ clientId }` (+ cursor predicate when supplied). Sort:
   * `{ updatedAt: -1, _id: -1 }` (DESC; same-millisecond ties broken by
   * `_id`). Projection limited to `(_id, name, identifier, channelId,
   * updatedAt)`. Uses the standard "limit + 1 → hasMore" pattern so the
   * caller can decide `nextCursor` without a second query.
   *
   * Filter is covered by the existing single-field index on `clientId`;
   * the sort tiebreaker on `_id` is not index-covered (page size is
   * bounded, so an in-memory tiebreaker pass is acceptable for Phase 5
   * — see plan §4 index-coverage proof).
   */
  async findInboxContactsPage(
    clientId: Types.ObjectId,
    opts: { cursor: InboxContactsCursor | null; limit: number },
  ): Promise<InboxContactsPageResult> {
    const filter: Record<string, unknown> = { clientId };
    if (opts.cursor) {
      filter.$or = [
        { updatedAt: { $lt: opts.cursor.t } },
        { updatedAt: opts.cursor.t, _id: { $lt: opts.cursor.i } },
      ];
    }

    const rows = (await this.model
      .find(filter, {
        _id: 1,
        name: 1,
        identifier: 1,
        channelId: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(opts.limit + 1)
      .lean()
      .exec()) as unknown as InboxContactRow[];

    if (rows.length <= opts.limit) {
      return { items: rows, nextCursor: null };
    }

    const items = rows.slice(0, opts.limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: { t: last.updatedAt, i: last._id },
    };
  }
}
