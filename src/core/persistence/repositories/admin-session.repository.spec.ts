import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AdminSessionRepository } from './admin-session.repository';
import { AdminSession } from '@persistence/schemas/admin-session.schema';

describe('AdminSessionRepository', () => {
  let repository: AdminSessionRepository;
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
        AdminSessionRepository,
        { provide: getModelToken(AdminSession.name), useValue: mockModel },
      ],
    }).compile();

    repository = moduleRef.get(AdminSessionRepository);
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

  describe('revokeAllForAdmin', () => {
    it('only revokes non-revoked sessions for the supplied admin', async () => {
      const adminUserId = new Types.ObjectId();
      const when = new Date();

      await repository.revokeAllForAdmin(adminUserId, when);

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        { adminUserId, revokedAt: null },
        { revokedAt: when },
      );
    });
  });

  describe('create', () => {
    it('forwards the input to model.create', async () => {
      const adminUserId = new Types.ObjectId();
      const input = {
        adminUserId,
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
