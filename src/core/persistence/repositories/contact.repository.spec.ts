import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContactRepository } from './contact.repository';

describe('ContactRepository', () => {
  it('returns same contact for same client + channel + channelIdentifier', async () => {
    const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const channelId = new Types.ObjectId('507f1f77bcf86cd799439012');
    const externalId = 'same-user-123';

    const existing = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
      clientId,
      channelId,
      externalId,
      status: 'active',
    };

    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      }),
    };

    const repository = new ContactRepository(model as any);

    const resultA = await repository.findOrCreateByExternalIdentity(
      clientId,
      channelId,
      externalId,
      externalId,
      'platform_id',
      'User A',
    );
    const resultB = await repository.findOrCreateByExternalIdentity(
      clientId,
      channelId,
      externalId,
      externalId,
      'platform_id',
      'User A',
    );

    expect(resultA._id.toString()).toBe(resultB._id.toString());
  });

  it('returns different contacts for same channelIdentifier in different clients', async () => {
    const channelId = new Types.ObjectId('507f1f77bcf86cd799439012');
    const clientA = new Types.ObjectId('507f1f77bcf86cd799439011');
    const clientB = new Types.ObjectId('507f1f77bcf86cd799439013');
    const externalId = 'same-user-123';

    const model = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId('507f1f77bcf86cd799439101'),
            clientId: clientA,
            channelId,
            externalId,
            status: 'active',
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId('507f1f77bcf86cd799439102'),
            clientId: clientB,
            channelId,
            externalId,
            status: 'active',
          }),
        }),
    };

    const repository = new ContactRepository(model as any);

    const resultA = await repository.findOrCreateByExternalIdentity(
      clientA,
      channelId,
      externalId,
      externalId,
      'platform_id',
      'User A',
    );

    const resultB = await repository.findOrCreateByExternalIdentity(
      clientB,
      channelId,
      externalId,
      externalId,
      'platform_id',
      'User A',
    );

    expect(resultA._id.toString()).not.toBe(resultB._id.toString());
  });

  it('returns different contacts for same human across different channels', async () => {
    const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const channelA = new Types.ObjectId('507f1f77bcf86cd799439012');
    const channelB = new Types.ObjectId('507f1f77bcf86cd799439013');
    const externalId = 'same-user-123';

    const model = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId('507f1f77bcf86cd799439103'),
            clientId,
            channelId: channelA,
            externalId,
            status: 'active',
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId('507f1f77bcf86cd799439104'),
            clientId,
            channelId: channelB,
            externalId,
            status: 'active',
          }),
        }),
    };

    const repository = new ContactRepository(model as any);

    const resultA = await repository.findOrCreateByExternalIdentity(
      clientId,
      channelA,
      externalId,
      externalId,
      'platform_id',
      'User A',
    );

    const resultB = await repository.findOrCreateByExternalIdentity(
      clientId,
      channelB,
      externalId,
      externalId,
      'platform_id',
      'User A',
    );

    expect(resultA._id.toString()).not.toBe(resultB._id.toString());
  });

  describe('findInboxContactsPage', () => {
    function buildPaginatedModel(rows: unknown) {
      const exec = jest.fn().mockResolvedValue(rows);
      const lean = jest.fn().mockReturnValue({ exec });
      const limit = jest.fn().mockReturnValue({ lean });
      const sort = jest.fn().mockReturnValue({ limit });
      const find = jest.fn().mockReturnValue({ sort });
      return { find, sort, limit, lean, exec };
    }

    it('filters by clientId, sorts (updatedAt DESC, _id DESC), uses limit + 1', async () => {
      const chain = buildPaginatedModel([]);
      const repository = new ContactRepository({ find: chain.find } as any);

      const clientId = new Types.ObjectId();
      await repository.findInboxContactsPage(clientId, {
        cursor: null,
        limit: 25,
      });

      const [filter, projection] = chain.find.mock.calls[0];
      expect(filter).toEqual({ clientId });
      expect(projection).toEqual({
        _id: 1,
        name: 1,
        identifier: 1,
        channelId: 1,
        updatedAt: 1,
      });
      expect(chain.sort).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 });
      expect(chain.limit).toHaveBeenCalledWith(26);
    });

    it('applies the cursor predicate on (updatedAt, _id) for same-millisecond tiebreaking', async () => {
      const chain = buildPaginatedModel([]);
      const repository = new ContactRepository({ find: chain.find } as any);

      const clientId = new Types.ObjectId();
      const cursorTs = new Date('2026-05-19T10:00:00Z');
      const cursorId = new Types.ObjectId();
      await repository.findInboxContactsPage(clientId, {
        cursor: { t: cursorTs, i: cursorId },
        limit: 10,
      });

      const [filter] = chain.find.mock.calls[0];
      expect(filter).toEqual({
        clientId,
        $or: [
          { updatedAt: { $lt: cursorTs } },
          { updatedAt: cursorTs, _id: { $lt: cursorId } },
        ],
      });
    });

    it('returns nextCursor=null when fewer than limit+1 rows are read', async () => {
      const rows = [
        {
          _id: new Types.ObjectId(),
          name: 'A',
          channelId: new Types.ObjectId(),
          updatedAt: new Date(),
        },
      ];
      const chain = buildPaginatedModel(rows);
      const repository = new ContactRepository({ find: chain.find } as any);

      const page = await repository.findInboxContactsPage(
        new Types.ObjectId(),
        {
          cursor: null,
          limit: 10,
        },
      );

      expect(page.items).toEqual(rows);
      expect(page.nextCursor).toBeNull();
    });

    it('returns nextCursor from the last surfaced row when more than limit rows are read', async () => {
      const ts1 = new Date('2026-05-19T10:00:02Z');
      const ts2 = new Date('2026-05-19T10:00:01Z');
      const ts3 = new Date('2026-05-19T10:00:00Z');
      const ids = [
        new Types.ObjectId(),
        new Types.ObjectId(),
        new Types.ObjectId(),
      ];
      const rows = [
        {
          _id: ids[0],
          name: 'A',
          channelId: new Types.ObjectId(),
          updatedAt: ts1,
        },
        {
          _id: ids[1],
          name: 'B',
          channelId: new Types.ObjectId(),
          updatedAt: ts2,
        },
        {
          _id: ids[2],
          name: 'C',
          channelId: new Types.ObjectId(),
          updatedAt: ts3,
        },
      ];
      const chain = buildPaginatedModel(rows);
      const repository = new ContactRepository({ find: chain.find } as any);

      const page = await repository.findInboxContactsPage(
        new Types.ObjectId(),
        {
          cursor: null,
          limit: 2,
        },
      );

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toEqual({ t: ts2, i: ids[1] });
    });
  });

  it('retries by reading existing contact when duplicate key error occurs', async () => {
    const duplicateError = Object.assign(
      new Error('E11000 duplicate key error'),
      {
        code: 11000,
      },
    );

    const existing = {
      _id: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      externalId: '14155550123',
      status: 'active',
    };

    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockRejectedValue(duplicateError),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existing),
        }),
      }),
    };

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const repository = new ContactRepository(model as any);

    const result = await repository.findOrCreateByExternalIdentity(
      existing.clientId,
      existing.channelId,
      existing.externalId,
      '+1 415 555 0123',
      'phone',
      'User',
    );

    expect(result).toEqual(existing);
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(model.findOne).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('event=contact_duplicate_key_retry'),
    );

    warnSpy.mockRestore();
  });
});
