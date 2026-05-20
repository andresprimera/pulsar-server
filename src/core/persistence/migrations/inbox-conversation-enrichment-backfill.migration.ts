import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';
import { Contact } from '@persistence/schemas/contact.schema';
import { Conversation } from '@persistence/schemas/conversation.schema';
import { Message } from '@persistence/schemas/message.schema';

const BACKFILL_CHUNK_SIZE = 5000;
const BACKFILL_MAX_ITERATIONS = 50;
const PREVIEW_MAX_LENGTH = 280;

interface ConversationRow {
  _id: Types.ObjectId;
  clientId: Types.ObjectId;
  channelId: Types.ObjectId;
  contactId: Types.ObjectId;
}

interface ContactRow {
  _id: Types.ObjectId;
  name?: string;
}

interface LatestMessageRow {
  _id: Types.ObjectId;
  latest: { content?: string };
}

interface ClientAgentMatchRow {
  _id: Types.ObjectId;
  clientId: string;
  channels: Array<{
    channelId?: Types.ObjectId;
    status?: 'active' | 'inactive';
  }>;
}

/**
 * Idempotent one-shot backfill for the inbox-list enrichment columns
 * (`clientAgentId`, `contactNameLower`, `lastMessagePreview`) on
 * `Conversation`. Mirrors `InboxControlModeBackfillMigration` in shape.
 *
 * Termination guard: `{ contactNameLower: { $exists: false } }`. After the
 * first successful pass the predicate empties, so re-runs are no-ops.
 */
@Injectable()
export class InboxConversationEnrichmentBackfillMigration
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    InboxConversationEnrichmentBackfillMigration.name,
  );

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<Contact>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
    @InjectModel(ClientAgent.name)
    private readonly clientAgentModel: Model<ClientAgent>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.backfillEnrichment();
    } catch (error) {
      this.logger.error(
        `InboxConversationEnrichmentBackfillMigration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private async backfillEnrichment(): Promise<void> {
    let total = 0;
    let enriched = 0;
    let ambiguous = 0;
    let missing = 0;
    let iterations = 0;

    while (iterations < BACKFILL_MAX_ITERATIONS) {
      const docs = (await this.conversationModel
        .find(
          { contactNameLower: { $exists: false } },
          { _id: 1, clientId: 1, channelId: 1, contactId: 1 },
        )
        .limit(BACKFILL_CHUNK_SIZE)
        .lean()
        .exec()) as ConversationRow[];

      if (docs.length === 0) {
        break;
      }

      const result = await this.processChunk(docs);
      total += result.total;
      enriched += result.enriched;
      ambiguous += result.ambiguous;
      missing += result.missing;
      iterations += 1;

      if (docs.length < BACKFILL_CHUNK_SIZE) {
        break;
      }
    }

    if (iterations === BACKFILL_MAX_ITERATIONS) {
      this.logger.warn(
        `InboxConversationEnrichmentBackfillMigration hit max iterations (${BACKFILL_MAX_ITERATIONS}); ${total} conversation(s) processed this pass. Remaining documents will be picked up on the next boot.`,
      );
    }

    if (total > 0) {
      this.logger.log(
        `event=inbox.backfill.summary total=${total} enriched=${enriched} ambiguous=${ambiguous} missing=${missing}`,
      );
    }
  }

  private async processChunk(rows: ConversationRow[]): Promise<{
    total: number;
    enriched: number;
    ambiguous: number;
    missing: number;
  }> {
    const contactIds = uniqueObjectIds(rows.map((r) => r.contactId));
    const conversationIds = rows.map((r) => r._id);

    const [contacts, latestByConv] = await Promise.all([
      contactIds.length > 0
        ? (this.contactModel
            .find({ _id: { $in: contactIds } }, { _id: 1, name: 1 })
            .lean()
            .exec() as unknown as Promise<ContactRow[]>)
        : Promise.resolve([] as ContactRow[]),
      this.messageModel
        .aggregate<LatestMessageRow>([
          {
            $match: {
              conversationId: { $in: conversationIds },
              status: 'active',
              type: { $in: ['user', 'agent'] },
            },
          },
          { $sort: { conversationId: 1, createdAt: -1 } },
          { $group: { _id: '$conversationId', latest: { $first: '$$ROOT' } } },
        ])
        .exec(),
    ]);

    const contactMap = new Map<string, ContactRow>(
      contacts.map((c) => [String(c._id), c]),
    );
    const latestMap = new Map<string, LatestMessageRow>(
      latestByConv.map((m) => [String(m._id), m]),
    );

    let enriched = 0;
    let ambiguous = 0;
    let missing = 0;

    for (const row of rows) {
      const contact = contactMap.get(String(row.contactId));
      const contactNameLower = (contact?.name ?? '').trim().toLowerCase();
      const latest = latestMap.get(String(row._id));
      const lastMessagePreview = (latest?.latest?.content ?? '').slice(
        0,
        PREVIEW_MAX_LENGTH,
      );

      const matches = (await this.clientAgentModel
        .find(
          {
            clientId: String(row.clientId),
            status: 'active',
            channels: {
              $elemMatch: { channelId: row.channelId, status: 'active' },
            },
          },
          { _id: 1, clientId: 1, channels: 1 },
        )
        .lean()
        .exec()) as unknown as ClientAgentMatchRow[];

      let clientAgentId: Types.ObjectId | undefined;
      if (matches.length === 1) {
        clientAgentId = matches[0]._id;
        enriched += 1;
      } else if (matches.length === 0) {
        missing += 1;
        this.logger.log(
          `event=inbox.backfill.missing conversationId=${String(row._id)}`,
        );
      } else {
        ambiguous += 1;
        this.logger.warn(
          `event=inbox.backfill.ambiguous conversationId=${String(
            row._id,
          )} clientId=${String(row.clientId)} channelId=${String(
            row.channelId,
          )} candidateCount=${matches.length}`,
        );
      }

      const $set: Record<string, unknown> = {
        contactNameLower,
        lastMessagePreview,
      };
      if (clientAgentId !== undefined) {
        $set.clientAgentId = clientAgentId;
      }

      await this.conversationModel.updateOne({ _id: row._id }, { $set }).exec();
    }

    return {
      total: rows.length,
      enriched,
      ambiguous,
      missing,
    };
  }
}

function uniqueObjectIds(ids: Types.ObjectId[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}
