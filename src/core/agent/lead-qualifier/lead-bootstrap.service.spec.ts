import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadBootstrapService } from './lead-bootstrap.service';
import { LeadNotFoundError } from './lead-bootstrap.errors';

describe('LeadBootstrapService', () => {
  let service: LeadBootstrapService;
  let leadRepository: {
    upsertStub: jest.Mock;
    findByConversation: jest.Mock;
    applyUpdate: jest.Mock;
  };
  let leadLifecycle: {
    mergeFields: jest.Mock;
    computeNextState: jest.Mock;
  };
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    leadRepository = {
      upsertStub: jest.fn(),
      findByConversation: jest.fn(),
      applyUpdate: jest.fn(),
    };
    leadLifecycle = {
      mergeFields: jest.fn(),
      computeNextState: jest.fn(),
    };
    service = new LeadBootstrapService(
      leadRepository as any,
      leadLifecycle as any,
    );
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy?.mockRestore();
  });

  describe('upsertStub', () => {
    it('delegates to repository and returns lead id as string', async () => {
      const leadId = new Types.ObjectId();
      leadRepository.upsertStub.mockResolvedValue({
        _id: leadId,
        state: 'new',
      });

      const result = await service.upsertStub({
        clientId: 'c1',
        conversationId: 'conv1',
        contactId: 'ct1',
        agentId: 'a1',
      });

      expect(leadRepository.upsertStub).toHaveBeenCalledWith({
        clientId: 'c1',
        conversationId: 'conv1',
        contactId: 'ct1',
        agentId: 'a1',
      });
      expect(result.leadId).toBe(leadId.toString());
    });
  });

  describe('applyUpdate', () => {
    it('throws LeadNotFoundError when no lead exists', async () => {
      leadRepository.findByConversation.mockResolvedValue(null);

      await expect(
        service.applyUpdate({
          clientId: 'c1',
          conversationId: 'conv1',
          input: { fields: { intent: 'demo' } },
        }),
      ).rejects.toBeInstanceOf(LeadNotFoundError);
    });

    it('merges fields, computes state, persists patch, returns next state', async () => {
      const leadId = new Types.ObjectId();
      const current = {
        _id: leadId,
        state: 'new',
        fields: { intent: 'demo' },
      };
      leadRepository.findByConversation.mockResolvedValue(current);
      const merged = {
        intent: 'demo',
        budget: { amount: 5000 },
        timeline: { horizon: 'Q3' },
      };
      leadLifecycle.mergeFields.mockReturnValue(merged);
      leadLifecycle.computeNextState.mockReturnValue('qualified');
      leadRepository.applyUpdate.mockResolvedValue({
        ...current,
        state: 'qualified',
        fields: merged,
      });

      const result = await service.applyUpdate({
        clientId: 'c1',
        conversationId: 'conv1',
        input: {
          fields: {
            budget: { amount: 5000 },
            timeline: { horizon: 'Q3' },
          },
          disqualify: false,
        },
      });

      expect(leadLifecycle.mergeFields).toHaveBeenCalledWith(
        { intent: 'demo' },
        { budget: { amount: 5000 }, timeline: { horizon: 'Q3' } },
      );
      expect(leadLifecycle.computeNextState).toHaveBeenCalledWith(
        merged,
        false,
        'new',
      );
      const [persistedId, patch] = leadRepository.applyUpdate.mock.calls[0];
      expect(persistedId).toBe(leadId);
      expect(patch.fields).toBe(merged);
      expect(patch.state).toBe('qualified');
      expect(patch.lastQualificationAt).toBeInstanceOf(Date);
      expect(result.state).toBe('qualified');
    });

    it('passes disqualify=true to lifecycle service', async () => {
      const leadId = new Types.ObjectId();
      leadRepository.findByConversation.mockResolvedValue({
        _id: leadId,
        state: 'in_progress',
        fields: {},
      });
      leadLifecycle.mergeFields.mockReturnValue({});
      leadLifecycle.computeNextState.mockReturnValue('disqualified');
      leadRepository.applyUpdate.mockResolvedValue({});

      const result = await service.applyUpdate({
        clientId: 'c1',
        conversationId: 'conv1',
        input: { fields: {}, disqualify: true },
      });

      expect(leadLifecycle.computeNextState).toHaveBeenCalledWith(
        {},
        true,
        'in_progress',
      );
      expect(result.state).toBe('disqualified');
    });
  });
});
