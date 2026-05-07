import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ClientAgentRepository } from './client-agent.repository';
import {
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
      countDocuments: jest.fn(),
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
    it('issues updateOne with arrayFilters containing botId and emits matched=true when both counts > 0', async () => {
      const exec = jest
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
      mockModel.updateOne.mockReturnValue({ exec });

      const result = await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registered',
        fingerprint: 'fp',
      });

      expect(mockModel.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update, opts] = mockModel.updateOne.mock.calls[0];
      expect(filter).toEqual(
        expect.objectContaining({
          status: 'active',
          channels: expect.objectContaining({
            $elemMatch: { status: 'active', telegramBotId: '12345' },
          }),
        }),
      );
      expect(update.$inc).toEqual({
        'channels.$[ch].webhookRegistration.attemptCount': 1,
      });
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
            ch: {
              'ch.status': 'active',
              'ch.telegramBotId': '12345',
            },
          },
        ],
      });
      expect(result).toEqual({ matched: true });
    });

    it('adds fingerprint $ne short-circuit only when status=registering and fingerprint provided', async () => {
      const exec = jest
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
      mockModel.updateOne.mockReturnValue({ exec });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registering',
        fingerprint: 'fp-1',
      });

      const [, , opts] = mockModel.updateOne.mock.calls[0];
      expect(
        opts.arrayFilters[0].ch['ch.webhookRegistration.fingerprint'],
      ).toEqual({ $ne: 'fp-1' });
    });

    it('returns matched=false when modifiedCount is 0 even if matchedCount > 0', async () => {
      const exec = jest
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 0 });
      mockModel.updateOne.mockReturnValue({ exec });

      const result = await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'registering',
        fingerprint: 'fp',
      });

      expect(result).toEqual({ matched: false });
    });

    it('writes lastError when provided', async () => {
      const exec = jest
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
      mockModel.updateOne.mockReturnValue({ exec });

      await repository.updateWebhookRegistrationByTelegramBotId({
        telegramBotId: '12345',
        status: 'failed',
        lastError: 'Unauthorized',
      });

      const [, update] = mockModel.updateOne.mock.calls[0];
      expect(update.$set['channels.$[ch].webhookRegistration.lastError']).toBe(
        'Unauthorized',
      );
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
});
