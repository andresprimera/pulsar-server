import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InboxControlModeBackfillMigration } from './inbox-control-mode-backfill.migration';
import { Conversation } from '@persistence/schemas/conversation.schema';

interface MockModel {
  find: jest.Mock;
  updateMany: jest.Mock;
}

const buildLeanCursor = (
  docs: Array<{ _id: unknown }>,
): { exec: jest.Mock } => ({
  exec: jest.fn().mockResolvedValue(docs),
});

const buildModel = (
  cursors: Array<Array<{ _id: unknown }>>,
  updateMatched: (i: number) => number = (i) => (cursors[i] ?? []).length,
): MockModel => {
  let updateCall = 0;
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
    updateMany: jest.fn().mockImplementation(() => ({
      exec: jest.fn().mockImplementation(async () => {
        const result = { modifiedCount: updateMatched(updateCall) };
        updateCall += 1;
        return result;
      }),
    })),
  };
};

const setup = async (model: MockModel) => {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      InboxControlModeBackfillMigration,
      { provide: getModelToken(Conversation.name), useValue: model },
    ],
  }).compile();
  return moduleRef.get(InboxControlModeBackfillMigration);
};

describe('InboxControlModeBackfillMigration', () => {
  it('is a no-op when no documents are missing the field', async () => {
    const model = buildModel([[]]);
    const migration = await setup(model);

    await migration.onApplicationBootstrap();

    expect(model.find).toHaveBeenCalledWith(
      { controlMode: { $exists: false } },
      { _id: 1 },
    );
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('backfills documents lacking controlMode with default "bot"', async () => {
    const ids = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];
    // second find call returns empty → loop terminates
    const model = buildModel([ids, []]);
    const migration = await setup(model);

    await migration.onApplicationBootstrap();

    expect(model.updateMany).toHaveBeenCalledTimes(1);
    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['a', 'b', 'c'] } },
      { $set: { controlMode: 'bot' } },
    );
  });

  it('continues across multiple chunks until find returns less than chunk size', async () => {
    const fullChunk = Array.from({ length: 5000 }, (_, i) => ({ _id: i }));
    const partial = [{ _id: 'last' }];
    const model = buildModel([fullChunk, partial]);
    const migration = await setup(model);

    await migration.onApplicationBootstrap();

    // Two update passes — one full chunk, one partial.
    expect(model.updateMany).toHaveBeenCalledTimes(2);
  });

  it('rethrows on error so startup fails fast', async () => {
    const model = buildModel([[{ _id: 'x' }]]);
    model.updateMany.mockImplementation(() => ({
      exec: jest.fn().mockRejectedValue(new Error('boom')),
    }));
    const migration = await setup(model);

    await expect(migration.onApplicationBootstrap()).rejects.toThrow('boom');
  });
});
