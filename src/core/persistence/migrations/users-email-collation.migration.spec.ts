import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { UsersEmailCollationMigration } from './users-email-collation.migration';
import { User } from '@persistence/schemas/user.schema';

interface MockCollection {
  dropIndex: jest.Mock;
  createIndex: jest.Mock;
}

interface MockModel {
  find: jest.Mock;
  updateOne: jest.Mock;
  collection: MockCollection;
}

const buildLeanCursor = (
  docs: Array<{ _id: unknown; email: string }>,
): { exec: jest.Mock } => ({
  exec: jest.fn().mockResolvedValue(docs),
});

const buildModel = (
  cursors: Array<Array<{ _id: unknown; email: string }>>,
): MockModel => {
  const limitImpl = (size: number) => {
    void size;
    return {
      lean: () => {
        const next = cursors.shift() ?? [];
        return buildLeanCursor(next);
      },
    };
  };
  return {
    find: jest.fn().mockReturnValue({ limit: limitImpl }),
    updateOne: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(undefined),
    }),
    collection: {
      dropIndex: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue('email_1_ci'),
    },
  };
};

describe('UsersEmailCollationMigration', () => {
  const buildMigration = async (
    model: MockModel,
  ): Promise<UsersEmailCollationMigration> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersEmailCollationMigration,
        { provide: getModelToken(User.name), useValue: model },
      ],
    }).compile();
    return moduleRef.get(UsersEmailCollationMigration);
  };

  it('normalizes mixed-case and trimmed emails during backfill', async () => {
    const id1 = new Types.ObjectId();
    const id2 = new Types.ObjectId();
    const model = buildModel([
      [
        { _id: id1, email: '  Foo@Example.COM' },
        { _id: id2, email: 'BAR@TEST.io ' },
      ],
      [],
    ]);

    const migration = await buildMigration(model);
    await migration.onApplicationBootstrap();

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: id1 },
      { email: 'foo@example.com' },
    );
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: id2 },
      { email: 'bar@test.io' },
    );
  });

  it('skips backfill when all emails are already normalized', async () => {
    const model = buildModel([[]]);

    const migration = await buildMigration(model);
    await migration.onApplicationBootstrap();

    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('honors the iteration cap and continues with the index step', async () => {
    const fullChunks: Array<Array<{ _id: unknown; email: string }>> = [];
    for (let i = 0; i < 60; i += 1) {
      const chunk = new Array(5000).fill(0).map((_, idx) => ({
        _id: new Types.ObjectId(),
        email: `MIXED${i}_${idx}@X.IO`,
      }));
      fullChunks.push(chunk);
    }
    const model = buildModel(fullChunks);

    const migration = await buildMigration(model);
    await migration.onApplicationBootstrap();

    // After capping, the dropIndex/createIndex steps must still run.
    expect(model.collection.dropIndex).toHaveBeenCalledWith('email_1');
    expect(model.collection.createIndex).toHaveBeenCalledWith(
      { email: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2 },
        name: 'email_1_ci',
      }),
    );
  });

  it('tolerates IndexNotFound when dropping the legacy index', async () => {
    const model = buildModel([[]]);
    const err: any = new Error('IndexNotFound');
    err.code = 27;
    model.collection.dropIndex.mockRejectedValue(err);

    const migration = await buildMigration(model);
    await expect(migration.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(model.collection.createIndex).toHaveBeenCalled();
  });

  it('tolerates NamespaceNotFound on dropIndex/createIndex', async () => {
    const model = buildModel([[]]);
    const dropErr: any = new Error('NamespaceNotFound');
    dropErr.code = 26;
    const createErr: any = new Error('NamespaceNotFound');
    createErr.code = 26;
    model.collection.dropIndex.mockRejectedValue(dropErr);
    model.collection.createIndex.mockRejectedValue(createErr);

    const migration = await buildMigration(model);
    await expect(migration.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('tolerates IndexOptionsConflict from concurrent createIndex', async () => {
    const model = buildModel([[]]);
    const err: any = new Error('IndexOptionsConflict');
    err.code = 85;
    model.collection.createIndex.mockRejectedValue(err);

    const migration = await buildMigration(model);
    await expect(migration.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('tolerates E11000 from a racy concurrent createIndex', async () => {
    const model = buildModel([[]]);
    const err: any = new Error('E11000 duplicate key');
    err.code = 11000;
    model.collection.createIndex.mockRejectedValue(err);

    const migration = await buildMigration(model);
    await expect(migration.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('rethrows unexpected errors', async () => {
    const model = buildModel([[]]);
    const err: any = new Error('boom');
    err.code = 999;
    model.collection.createIndex.mockRejectedValue(err);

    const migration = await buildMigration(model);
    await expect(migration.onApplicationBootstrap()).rejects.toThrow('boom');
  });
});
