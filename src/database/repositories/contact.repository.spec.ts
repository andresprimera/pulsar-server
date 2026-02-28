import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContactRepository } from './contact.repository';

describe('ContactRepository', () => {
  it('retries by reading existing contact when duplicate key error occurs', async () => {
    const duplicateError = Object.assign(new Error('E11000 duplicate key error'), {
      code: 11000,
    });

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
