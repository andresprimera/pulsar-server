import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadRepository } from './lead.repository';

describe('LeadRepository', () => {
  describe('upsertStub', () => {
    it('returns a new document the first time with state="new"', async () => {
      const clientId = new Types.ObjectId();
      const conversationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const agentId = new Types.ObjectId();

      const created = {
        _id: new Types.ObjectId(),
        clientId,
        conversationId,
        contactId,
        agentId,
        state: 'new',
        fields: {},
      };

      const findOneAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(created),
      });

      const repository = new LeadRepository({ findOneAndUpdate } as any);

      const result = await repository.upsertStub({
        clientId,
        conversationId,
        contactId,
        agentId,
      });

      expect(result).toBe(created);
      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { clientId, conversationId },
        {
          $setOnInsert: {
            clientId,
            conversationId,
            contactId,
            agentId,
            state: 'new',
            fields: {},
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    });

    it('returns same _id on second call and never resets advanced state ($setOnInsert only)', async () => {
      const clientId = new Types.ObjectId();
      const conversationId = new Types.ObjectId();
      const sharedId = new Types.ObjectId();
      const firstCall = {
        _id: sharedId,
        clientId,
        conversationId,
        state: 'new',
        fields: {},
      };
      // Second call: state has been advanced externally — repo must not reset it.
      const secondCall = {
        _id: sharedId,
        clientId,
        conversationId,
        state: 'qualified',
        fields: { intent: 'demo' },
      };

      const findOneAndUpdate = jest
        .fn()
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(firstCall),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(secondCall),
        });
      const repository = new LeadRepository({ findOneAndUpdate } as any);

      const a = await repository.upsertStub({
        clientId,
        conversationId,
        contactId: new Types.ObjectId(),
        agentId: new Types.ObjectId(),
      });
      const b = await repository.upsertStub({
        clientId,
        conversationId,
        contactId: new Types.ObjectId(),
        agentId: new Types.ObjectId(),
      });

      expect(a._id.toString()).toBe(b._id.toString());
      expect(b.state).toBe('qualified');
      // Both calls must use $setOnInsert (never $set) so existing state is preserved.
      for (const call of findOneAndUpdate.mock.calls) {
        const updateArg = call[1];
        expect(updateArg).toHaveProperty('$setOnInsert');
        expect(updateArg).not.toHaveProperty('$set');
      }
    });

    it('retries by reading existing document on E11000 duplicate key error', async () => {
      const clientId = new Types.ObjectId();
      const conversationId = new Types.ObjectId();
      const existing = {
        _id: new Types.ObjectId(),
        clientId,
        conversationId,
        state: 'new',
        fields: {},
      };
      const duplicateError = Object.assign(new Error('E11000'), {
        code: 11000,
      });

      const findOneAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockRejectedValue(duplicateError),
      });
      const findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const repository = new LeadRepository({
        findOneAndUpdate,
        findOne,
      } as any);

      const result = await repository.upsertStub({
        clientId,
        conversationId,
        contactId: new Types.ObjectId(),
        agentId: new Types.ObjectId(),
      });

      expect(result).toBe(existing);
      expect(findOne).toHaveBeenCalledWith({ clientId, conversationId });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('event=lead_duplicate_key_retry'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('findByConversation', () => {
    it('returns null when no lead exists', async () => {
      const findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const repository = new LeadRepository({ findOne } as any);

      const result = await repository.findByConversation(
        new Types.ObjectId(),
        new Types.ObjectId(),
      );

      expect(result).toBeNull();
    });

    it('coerces string ids to ObjectId in the filter', async () => {
      const clientId = new Types.ObjectId();
      const conversationId = new Types.ObjectId();
      const findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const repository = new LeadRepository({ findOne } as any);

      await repository.findByConversation(
        clientId.toString(),
        conversationId.toString(),
      );

      const [filter] = findOne.mock.calls[0];
      expect(filter.clientId.toString()).toBe(clientId.toString());
      expect(filter.conversationId.toString()).toBe(conversationId.toString());
    });
  });

  describe('applyUpdate', () => {
    it('mutates fields, state, and lastQualificationAt via $set', async () => {
      const leadId = new Types.ObjectId();
      const now = new Date('2026-05-22T12:00:00Z');
      const updated = {
        _id: leadId,
        state: 'qualified',
        fields: { intent: 'demo' },
        lastQualificationAt: now,
      };
      const findByIdAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      });
      const repository = new LeadRepository({ findByIdAndUpdate } as any);

      const result = await repository.applyUpdate(leadId, {
        fields: { intent: 'demo' },
        state: 'qualified',
        lastQualificationAt: now,
      });

      expect(result).toBe(updated);
      expect(findByIdAndUpdate).toHaveBeenCalledWith(
        leadId,
        {
          $set: {
            fields: { intent: 'demo' },
            state: 'qualified',
            lastQualificationAt: now,
          },
        },
        { new: true },
      );
    });
  });
});
