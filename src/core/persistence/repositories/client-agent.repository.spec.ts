import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ClientAgentRepository } from './client-agent.repository';
import {
  CLIENT_AGENT_CLIENT_LIST_PROJECTION,
  CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING,
  CLIENT_AGENT_LIST_PROJECTION,
  CLIENT_AGENT_LIST_PROJECTION_STRING,
} from './client-agent.repository.constants';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';

describe('ClientAgentRepository telegram webhook methods', () => {
  let repository: ClientAgentRepository;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      find: jest.fn(),
      updateOne: jest.fn(),
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
      collection: {
        updateOne: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAgentRepository,
        { provide: getModelToken(ClientAgent.name), useValue: mockModel },
      ],
    }).compile();

    repository = module.get(ClientAgentRepository);
  });

  describe('findActiveByTelegramBotIdForWebhookRegistration', () => {
    it('queries for active hire+channel and selects credentials and webhookRegistration projection', async () => {
      const exec = jest.fn().mockResolvedValue([{ _id: 'a-1' }]);
      const select2 = jest.fn().mockReturnValue({ exec });
      const select1 = jest.fn().mockReturnValue({ select: select2 });
      mockModel.find.mockReturnValue({ select: select1 });

      const result =
        await repository.findActiveByTelegramBotIdForWebhookRegistration(
          '12345',
        );

      expect(mockModel.find).toHaveBeenCalledWith({
        status: 'active',
        channels: {
          $elemMatch: { status: 'active', telegramBotId: '12345' },
        },
      });
      expect(select1).toHaveBeenCalledWith(
        expect.stringContaining('channels.webhookRegistration'),
      );
      expect(select2).toHaveBeenCalledWith('+channels.credentials');
      expect(result).toEqual([{ _id: 'a-1' }]);
    });
  });

  describe('updateWebhookRegistrationByTelegramBotId', () => {
    it('does NOT $inc attemptCount by default (incrementAttempt omitted)', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const result = await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registered',
        fingerprint: 'fp',
      });

      expect(mockModel.collection.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update, opts] =
        mockModel.collection.updateOne.mock.calls[0];
      expect(filter).toEqual(
        expect.objectContaining({
          status: 'active',
          channels: expect.objectContaining({
            $elemMatch: { status: 'active', telegramBotId: '12345' },
          }),
        }),
      );
      expect(update.$inc).toBeUndefined();
      expect(update.$set['channels.$[ch].webhookRegistration.status']).toBe(
        'registered',
      );
      expect(
        update.$set['channels.$[ch].webhookRegistration.registeredAt'],
      ).toBeInstanceOf(Date);
      expect(update.$set['channels.$[ch].webhookRegistration.lastError']).toBe(
        null,
      );
      expect(opts).toEqual({
        arrayFilters: [
          {
            'ch.status': 'active',
            'ch.telegramBotId': '12345',
          },
        ],
      });
      expect(result).toEqual({ matched: true });
    });

    it('emits $inc only when incrementAttempt=true', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'failed',
        lastError: 'boom',
        incrementAttempt: true,
      });

      const [, update] = mockModel.collection.updateOne.mock.calls[0];
      expect(update.$inc).toEqual({
        'channels.$[ch].webhookRegistration.attemptCount': 1,
      });
    });

    it('adds fingerprint $ne short-circuit only when status=registering and fingerprint provided', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registering',
        fingerprint: 'fp-1',
      });

      const [, , opts] = mockModel.collection.updateOne.mock.calls[0];
      expect(
        opts.arrayFilters[0]['ch.webhookRegistration.fingerprint'],
      ).toEqual({ $ne: 'fp-1' });
    });

    it('expectStatus with concrete values applies $in array-filter predicate', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registering',
        expectStatus: ['pending', 'failed'],
      });

      const [, , opts] = mockModel.collection.updateOne.mock.calls[0];
      expect(opts.arrayFilters[0]['ch.webhookRegistration.status']).toEqual({
        $in: ['pending', 'failed'],
      });
    });

    it("expectStatus = ['absent'] matches via $in: [null]", async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'pending',
        expectStatus: ['absent'],
      });

      const [, , opts] = mockModel.collection.updateOne.mock.calls[0];
      expect(opts.arrayFilters[0]['ch.webhookRegistration.status']).toEqual({
        $in: [null],
      });
    });

    it("expectStatus mixing 'absent' and concrete statuses adds null to $in", async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'pending',
        expectStatus: ['absent', 'pending', 'failed', 'registering'],
      });

      const [, , opts] = mockModel.collection.updateOne.mock.calls[0];
      expect(opts.arrayFilters[0]['ch.webhookRegistration.status']).toEqual({
        $in: ['pending', 'failed', 'registering', null],
      });
    });

    it('expectLastAttemptAtBefore appends $lt predicate to array filter', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const cutoff = new Date('2026-05-07T00:00:00Z');
      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'failed',
        expectStatus: ['registering'],
        expectLastAttemptAtBefore: cutoff,
      });

      const [, , opts] = mockModel.collection.updateOne.mock.calls[0];
      expect(
        opts.arrayFilters[0]['ch.webhookRegistration.lastAttemptAt'],
      ).toEqual({ $lt: cutoff });
    });

    it('returns matched=false when modifiedCount is 0 even if matchedCount > 0', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 0,
      });

      const result = await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registering',
        fingerprint: 'fp',
      });

      expect(result).toEqual({ matched: false });
    });

    it('writes lastError when provided', async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'failed',
        lastError: 'Unauthorized',
      });

      const [, update] = mockModel.collection.updateOne.mock.calls[0];
      expect(update.$set['channels.$[ch].webhookRegistration.lastError']).toBe(
        'Unauthorized',
      );
    });
  });

  describe('quarantineWebhookRegistration', () => {
    it("sets status='quarantined' without $inc", async () => {
      mockModel.collection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const result = await repository.quarantineWebhookRegistration({
        telegramBotId: '12345',
        lastError: 'reconciler:quarantine_threshold_exceeded',
      });

      const [, update] = mockModel.collection.updateOne.mock.calls[0];
      expect(update.$set['channels.$[ch].webhookRegistration.status']).toBe(
        'quarantined',
      );
      expect(update.$inc).toBeUndefined();
      expect(update.$set['channels.$[ch].webhookRegistration.lastError']).toBe(
        'reconciler:quarantine_threshold_exceeded',
      );
      expect(result).toEqual({ matched: true });
    });
  });

  describe('findReconcilableTelegramHires', () => {
    it('runs an aggregation pipeline filtering active hires + telegram channels in eligible states', async () => {
      const exec = jest.fn().mockResolvedValue([
        {
          _id: 'a-1',
          ch: {
            telegramBotId: '12345',
            webhookRegistration: { status: 'pending', attemptCount: 0 },
          },
        },
      ]);
      mockModel.aggregate.mockReturnValue({ exec });

      const cutoff = new Date('2026-05-07T00:00:00Z');
      const rows = await repository.findReconcilableTelegramHires({
        limit: 100,
        stuckRegisteringCutoff: cutoff,
        quarantineThreshold: 4,
      });

      expect(mockModel.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = mockModel.aggregate.mock.calls[0][0];
      expect(pipeline[0]).toEqual({ $match: { status: 'active' } });
      expect(pipeline[1]).toEqual({ $unwind: '$channels' });
      expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 100 });

      expect(rows).toEqual([
        {
          clientAgentId: 'a-1',
          telegramBotId: '12345',
          currentStatus: 'pending',
          attemptCount: 0,
        },
      ]);
    });

    it('returns attemptCount=0 when not present', async () => {
      const exec = jest.fn().mockResolvedValue([
        {
          _id: 'a-1',
          ch: { telegramBotId: '999' },
        },
      ]);
      mockModel.aggregate.mockReturnValue({ exec });

      const rows = await repository.findReconcilableTelegramHires({
        limit: 10,
        stuckRegisteringCutoff: new Date(),
        quarantineThreshold: 4,
      });

      expect(rows[0].attemptCount).toBe(0);
      expect(rows[0].currentStatus).toBeUndefined();
    });
  });

  describe('findPageWithProjection', () => {
    it('invokes model.find with the safe projection string and applies sort/skip/limit', async () => {
      const exec = jest.fn().mockResolvedValue([{ _id: 'ca-1' }]);
      const lean = jest.fn().mockReturnValue({ exec });
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      mockModel.find.mockReturnValue({ sort });

      const filter = { status: 'active' };
      const result = await repository.findPageWithProjection(filter, {
        skip: 10,
        limit: 5,
        sort: { createdAt: -1 },
      });

      expect(mockModel.find).toHaveBeenCalledWith(
        filter,
        CLIENT_AGENT_LIST_PROJECTION_STRING,
      );
      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skip).toHaveBeenCalledWith(10);
      expect(limit).toHaveBeenCalledWith(5);
      expect(lean).toHaveBeenCalled();
      expect(result).toEqual([{ _id: 'ca-1' }]);
    });
  });

  describe('CLIENT_AGENT_LIST_PROJECTION redaction guarantees', () => {
    it('does not leak secret-bearing channel paths', () => {
      expect(CLIENT_AGENT_LIST_PROJECTION).not.toContain(
        'channels.credentials',
      );
      expect(CLIENT_AGENT_LIST_PROJECTION).not.toContain(
        'channels.telegramWebhookSecretHex',
      );
      expect(CLIENT_AGENT_LIST_PROJECTION).not.toContain(
        'channels.webhookRegistration.fingerprint',
      );
      expect(CLIENT_AGENT_LIST_PROJECTION).not.toContain('promptSupplement');
    });
  });

  describe('countByFilter', () => {
    it('invokes model.countDocuments with the given filter', async () => {
      const exec = jest.fn().mockResolvedValue(7);
      mockModel.countDocuments.mockReturnValue({ exec });

      const filter = { clientId: 'client-1' };
      const result = await repository.countByFilter(filter);

      expect(mockModel.countDocuments).toHaveBeenCalledWith(filter);
      expect(result).toBe(7);
    });
  });

  describe('findProjectedByClientForClientList', () => {
    function setupChain(resolved: unknown) {
      const exec = jest.fn().mockResolvedValue(resolved);
      const lean = jest.fn().mockReturnValue({ exec });
      const sort = jest.fn().mockReturnValue({ lean });
      mockModel.find.mockReturnValue({ sort });
      return { exec, lean, sort };
    }

    it('filters by clientId with the client-tier projection string', async () => {
      setupChain([]);

      await repository.findProjectedByClientForClientList('client-1');

      expect(mockModel.find).toHaveBeenCalledWith(
        { clientId: 'client-1' },
        CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING,
      );
    });

    it('sorts ascending by createdAt then _id (stable tiebreaker)', async () => {
      const chain = setupChain([]);

      await repository.findProjectedByClientForClientList('client-1');

      expect(chain.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    });

    it('applies .lean() before .exec()', async () => {
      const chain = setupChain([]);

      await repository.findProjectedByClientForClientList('client-1');

      expect(chain.lean).toHaveBeenCalledTimes(1);
      expect(chain.exec).toHaveBeenCalledTimes(1);
    });

    it('returns the model result unchanged', async () => {
      const rows = [
        {
          _id: 'ca-1',
          status: 'active',
          agentId: 'agent-1',
          createdAt: new Date(),
        },
      ];
      setupChain(rows);

      const result = await repository.findProjectedByClientForClientList(
        'client-1',
      );

      expect(result).toBe(rows);
    });

    it('uses a projection string that does not contain sensitive subpaths', () => {
      // Defense in depth: even if a future contributor accidentally adds a
      // sensitive top-level field to the client-tier projection, this guard
      // catches the most common leak vectors before it ships.
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'channels',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'credentials',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'apiKey',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'agentPricing',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'billingAnchor',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'personalityId',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'toolingProfileId',
      );
      expect(CLIENT_AGENT_CLIENT_LIST_PROJECTION_STRING).not.toContain(
        'promptSupplement',
      );
    });

    it('CLIENT_AGENT_CLIENT_LIST_PROJECTION is exactly the four allowlisted fields', () => {
      expect([...CLIENT_AGENT_CLIENT_LIST_PROJECTION].sort()).toEqual([
        '_id',
        'agentId',
        'createdAt',
        'status',
      ]);
    });
  });
});
