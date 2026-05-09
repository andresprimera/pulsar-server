import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@persistence/schemas/user.schema';

const BACKFILL_CHUNK_SIZE = 5000;
const BACKFILL_MAX_ITERATIONS = 50;
const LEGACY_INDEX_NAME = 'email_1';
const COLLATION_INDEX_NAME = 'email_1_ci';

// Tolerated MongoDB error codes (idempotent / multi-instance safe).
const INDEX_NOT_FOUND = 27;
const NAMESPACE_NOT_FOUND = 26;
const INDEX_OPTIONS_CONFLICT = 85;
const DUPLICATE_KEY = 11000;

const isMongoError = (
  error: unknown,
): error is { code?: number; codeName?: string; message?: string } =>
  typeof error === 'object' && error !== null;

const errorCode = (error: unknown): number | undefined => {
  if (!isMongoError(error)) return undefined;
  return typeof error.code === 'number' ? error.code : undefined;
};

@Injectable()
export class UsersEmailCollationMigration implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersEmailCollationMigration.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.backfillNormalizedEmails();
      await this.dropLegacyEmailIndex();
      await this.ensureCollationAwareIndex();
    } catch (error) {
      this.logger.error(
        `UsersEmailCollationMigration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private async backfillNormalizedEmails(): Promise<void> {
    let iterations = 0;
    while (iterations < BACKFILL_MAX_ITERATIONS) {
      const cursor = this.userModel
        .find(
          {
            $expr: {
              $ne: [
                '$email',
                {
                  $toLower: {
                    $trim: { input: '$email' },
                  },
                },
              ],
            },
          },
          { _id: 1, email: 1 },
        )
        .limit(BACKFILL_CHUNK_SIZE)
        .lean();

      const docs = (await cursor.exec()) as Array<{
        _id: unknown;
        email: string;
      }>;

      if (docs.length === 0) {
        return;
      }

      for (const doc of docs) {
        const normalized = String(doc.email).trim().toLowerCase();
        await this.userModel
          .updateOne({ _id: doc._id }, { email: normalized })
          .exec();
      }

      iterations += 1;

      if (docs.length < BACKFILL_CHUNK_SIZE) {
        return;
      }
    }

    this.logger.warn(
      `UsersEmailCollationMigration backfill hit max iterations (${BACKFILL_MAX_ITERATIONS}); continuing with index step.`,
    );
  }

  private async dropLegacyEmailIndex(): Promise<void> {
    try {
      await this.userModel.collection.dropIndex(LEGACY_INDEX_NAME);
      this.logger.log(
        `Dropped legacy index "${LEGACY_INDEX_NAME}" on users.email`,
      );
    } catch (error) {
      const code = errorCode(error);
      if (code === INDEX_NOT_FOUND || code === NAMESPACE_NOT_FOUND) {
        return;
      }
      throw error;
    }
  }

  private async ensureCollationAwareIndex(): Promise<void> {
    try {
      await this.userModel.collection.createIndex(
        { email: 1 },
        {
          unique: true,
          collation: { locale: 'en', strength: 2 },
          name: COLLATION_INDEX_NAME,
        },
      );
      this.logger.log(
        `Verified collation-aware unique index "${COLLATION_INDEX_NAME}" on users.email`,
      );
    } catch (error) {
      const code = errorCode(error);
      if (
        code === INDEX_NOT_FOUND ||
        code === INDEX_OPTIONS_CONFLICT ||
        code === NAMESPACE_NOT_FOUND ||
        code === DUPLICATE_KEY
      ) {
        return;
      }
      throw error;
    }
  }
}
