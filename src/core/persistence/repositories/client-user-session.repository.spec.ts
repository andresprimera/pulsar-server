import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ClientUserSessionRepository } from './client-user-session.repository';
import { ClientUserSession } from '@persistence/schemas/client-user-session.schema';

describe('ClientUserSessionRepository', () => {
  let repository: ClientUserSessionRepository;
  let mockModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
    updateMany: jest.Mock;
  };

  const mockSession = {
    _id: 'session-1',
    tokenHash: 'hash',
    revokedAt: null,
  };

  beforeEach(async () => {
    mockModel = {
      create: jest.fn().mockResolvedValue([mockSession]),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSession),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSession),
      }),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      }),
      updateMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientUserSessionRepository,
        {
          provide: getModelToken(ClientUserSession.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = moduleRef.get(ClientUserSessionRepository);
  });

  describe('findActiveByTokenHash', () => {
    it('issues a single Mongo query filtering by tokenHash, revokedAt:null, and expiresAt:{$gt:now}', async () => {
      await repository.findActiveByTokenHash('hash-value');

      expect(mockModel.findOne).toHaveBeenCalledTimes(1);
      const filter = mockModel.findOne.mock.calls[0][0];
      expect(filter.tokenHash).toBe('hash-value');
      expect(filter.revokedAt).toBeNull();
      expect(filter.expiresAt).toEqual({ $gt: expect.any(Date) });
    });

    it('returns null when no active session matches', async () => {
      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      expect(await repository.findActiveByTokenHash('h')).toBeNull();
    });
  });

  describe('findById', () => {
    it('delegates to model.findById', async () => {
      const result = await repository.findById('session-1');
      expect(mockModel.findById).toHaveBeenCalledWith('session-1');
      expect(result).toBe(mockSession);
    });
  });

  describe('touchLastSeen', () => {
    it('updates both lastSeenAt and expiresAt in a single write', async () => {
      const lastSeenAt = new Date();
      const expiresAt = new Date(Date.now() + 1_000);

      await repository.touchLastSeen('session-1', lastSeenAt, expiresAt);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: 'session-1' },
        { lastSeenAt, expiresAt },
      );
    });
  });

  describe('revoke', () => {
    it('sets revokedAt to the supplied timestamp', async () => {
      const when = new Date();
      await repository.revoke('session-1', when);
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: 'session-1' },
        { revokedAt: when },
      );
    });
  });

  describe('revokeAllForUser', () => {
    it('only revokes non-revoked sessions for the supplied user', async () => {
      const userId = new Types.ObjectId();
      const when = new Date();

      await repository.revokeAllForUser(userId, when);

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        { userId, revokedAt: null },
        { revokedAt: when },
      );
    });
  });

  describe('create', () => {
    it('forwards the input to model.create', async () => {
      const userId = new Types.ObjectId();
      const clientId = new Types.ObjectId();
      const input = {
        userId,
        clientId,
        tokenHash: 'h',
        expiresAt: new Date(),
        userAgent: 'agent',
        ip: '1.2.3.4',
      };

      const result = await repository.create(input);

      expect(mockModel.create).toHaveBeenCalledWith([input]);
      expect(result).toBe(mockSession);
    });
  });
});
