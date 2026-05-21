import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_CONTROL_MODE } from '@shared/inbox/control-mode';
import { Conversation } from '@persistence/schemas/conversation.schema';

const BACKFILL_CHUNK_SIZE = 5000;
const BACKFILL_MAX_ITERATIONS = 50;

/**
 * Idempotent backfill for the `controlMode` field on `Conversation`.
 *
 * Lives in `persistence/` (not in `features/inbox/`) so any environment
 * that loads `DatabaseModule` — including `worker.module.ts` — runs the
 * backfill. Mirrors `UsersEmailCollationMigration` in shape, except this
 * migration manages NO indexes (Mongoose `autoIndex` creates
 * `inbox_list_idx` from the schema).
 *
 * Safe to re-run: the `$exists: false` filter matches zero documents
 * after the first successful pass.
 */
@Injectable()
export class InboxControlModeBackfillMigration
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(InboxControlModeBackfillMigration.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.backfillControlMode();
    } catch (error) {
      this.logger.error(
        `InboxControlModeBackfillMigration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private async backfillControlMode(): Promise<void> {
    let totalUpdated = 0;
    let iterations = 0;
    while (iterations < BACKFILL_MAX_ITERATIONS) {
      const docs = (await this.conversationModel
        .find({ controlMode: { $exists: false } }, { _id: 1 })
        .limit(BACKFILL_CHUNK_SIZE)
        .lean()
        .exec()) as Array<{ _id: unknown }>;

      if (docs.length === 0) {
        if (totalUpdated > 0) {
          this.logger.log(
            `InboxControlModeBackfillMigration backfilled controlMode='${DEFAULT_CONTROL_MODE}' on ${totalUpdated} conversation(s).`,
          );
        }
        return;
      }

      const ids = docs.map((d) => d._id);
      const result = await this.conversationModel
        .updateMany(
          { _id: { $in: ids } },
          { $set: { controlMode: DEFAULT_CONTROL_MODE } },
        )
        .exec();

      totalUpdated += result.modifiedCount ?? 0;
      iterations += 1;

      if (docs.length < BACKFILL_CHUNK_SIZE) {
        if (totalUpdated > 0) {
          this.logger.log(
            `InboxControlModeBackfillMigration backfilled controlMode='${DEFAULT_CONTROL_MODE}' on ${totalUpdated} conversation(s).`,
          );
        }
        return;
      }
    }

    this.logger.warn(
      `InboxControlModeBackfillMigration backfill hit max iterations (${BACKFILL_MAX_ITERATIONS}); ${totalUpdated} document(s) updated this pass. Remaining documents will be picked up on the next boot.`,
    );
  }
}
