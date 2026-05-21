import { Types } from 'mongoose';
import { ConversationReadRepository } from './conversation-read.repository';

function buildModel(): {
  findOneAndUpdate: jest.Mock;
  deleteOne: jest.Mock;
  find: jest.Mock;
} {
  return {
    findOneAndUpdate: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({}),
    }),
    deleteOne: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    }),
    find: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    }),
  };
}

describe('ConversationReadRepository', () => {
  describe('markRead', () => {
    it('upserts by (conversationId, operatorClientUserId) and sets lastReadAt + clientId', async () => {
      const model = buildModel();
      const repo = new ConversationReadRepository(model as any);

      const conversationId = new Types.ObjectId();
      const operatorClientUserId = new Types.ObjectId();
      const clientId = new Types.ObjectId();
      const lastReadAt = new Date('2026-05-21T00:00:00Z');

      await repo.markRead({
        conversationId,
        operatorClientUserId,
        clientId,
        lastReadAt,
      });

      const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ conversationId, operatorClientUserId });
      expect(update).toEqual({ $set: { lastReadAt, clientId } });
      expect(options).toMatchObject({ upsert: true, new: true });
    });
  });

  describe('markUnread', () => {
    it('deletes by the full tenant-scoped key tuple', async () => {
      const model = buildModel();
      const repo = new ConversationReadRepository(model as any);

      const conversationId = new Types.ObjectId();
      const operatorClientUserId = new Types.ObjectId();
      const clientId = new Types.ObjectId();

      await repo.markUnread({
        conversationId,
        operatorClientUserId,
        clientId,
      });

      expect(model.deleteOne).toHaveBeenCalledWith({
        conversationId,
        operatorClientUserId,
        clientId,
      });
    });

    it('is idempotent on missing rows (deleteOne returns deletedCount=0)', async () => {
      const model = buildModel();
      const repo = new ConversationReadRepository(model as any);

      await expect(
        repo.markUnread({
          conversationId: new Types.ObjectId(),
          operatorClientUserId: new Types.ObjectId(),
          clientId: new Types.ObjectId(),
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findByConversationsForOperator', () => {
    it('returns empty array on empty input without hitting the model', async () => {
      const model = buildModel();
      const repo = new ConversationReadRepository(model as any);

      const result = await repo.findByConversationsForOperator(
        [],
        new Types.ObjectId(),
        new Types.ObjectId(),
      );
      expect(result).toEqual([]);
      expect(model.find).not.toHaveBeenCalled();
    });

    it('filters by clientId and operatorClientUserId for cross-tenant defense', async () => {
      const model = buildModel();
      const repo = new ConversationReadRepository(model as any);

      const operatorClientUserId = new Types.ObjectId();
      const clientId = new Types.ObjectId();
      const id1 = new Types.ObjectId();
      const id2 = new Types.ObjectId();

      await repo.findByConversationsForOperator(
        [id1, id2],
        operatorClientUserId,
        clientId,
      );

      const [filter, projection] = model.find.mock.calls[0];
      expect(filter).toEqual({
        operatorClientUserId,
        clientId,
        conversationId: { $in: [id1, id2] },
      });
      expect(projection).toEqual({ conversationId: 1, lastReadAt: 1 });
    });
  });
});
