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
