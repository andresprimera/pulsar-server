import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminUserRepository } from './admin-user.repository';
import { AdminUser } from '@persistence/schemas/admin-user.schema';

describe('AdminUserRepository', () => {
  let repository: AdminUserRepository;
  let mockModel: {
    create: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
    countDocuments: jest.Mock;
  };

  const mockAdmin = {
    _id: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active' as const,
  };

  beforeEach(async () => {
    mockModel = {
      create: jest.fn().mockResolvedValue([mockAdmin]),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAdmin),
      }),
      findOne: jest.fn(),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserRepository,
        { provide: getModelToken(AdminUser.name), useValue: mockModel },
      ],
    }).compile();

    repository = moduleRef.get(AdminUserRepository);
  });

  describe('findByEmail', () => {
    it('lowercases the input email and applies case-insensitive collation', async () => {
      const collationExec = jest.fn().mockResolvedValue(mockAdmin);
      const collationChain = { exec: collationExec };
      mockModel.findOne.mockReturnValue({
        collation: jest.fn().mockReturnValue(collationChain),
      });

      const result = await repository.findByEmail('Admin@Example.COM');

      expect(mockModel.findOne).toHaveBeenCalledWith({
        email: 'admin@example.com',
      });
      const findOneReturn = mockModel.findOne.mock.results[0].value;
      expect(findOneReturn.collation).toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
      });
      expect(result).toEqual(mockAdmin);
    });
  });

  describe('findByEmailWithPasswordHash', () => {
    it('explicitly selects passwordHash and applies collation', async () => {
      const selectExec = jest
        .fn()
        .mockResolvedValue({ ...mockAdmin, passwordHash: 'hash' });
      const selectChain = { exec: selectExec };
      const collationChain = {
        select: jest.fn().mockReturnValue(selectChain),
      };
      mockModel.findOne.mockReturnValue({
        collation: jest.fn().mockReturnValue(collationChain),
      });

      const result = await repository.findByEmailWithPasswordHash(
        'admin@example.com',
      );

      const findOneReturn = mockModel.findOne.mock.results[0].value;
      expect(findOneReturn.collation).toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
      });
      expect(collationChain.select).toHaveBeenCalledWith('+passwordHash');
      expect(result).toEqual({ ...mockAdmin, passwordHash: 'hash' });
    });
  });

  describe('create', () => {
    it('forwards the input to model.create', async () => {
      const input = {
        email: 'new@example.com',
        passwordHash: 'h',
        displayName: 'New',
      };
      const result = await repository.create(input);
      expect(mockModel.create).toHaveBeenCalledWith([input]);
      expect(result).toBe(mockAdmin);
    });
  });

  describe('setLastLoginAt', () => {
    it('issues an updateOne with the lastLoginAt field', async () => {
      const when = new Date();
      await repository.setLastLoginAt('admin-1', when);
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: 'admin-1' },
        { lastLoginAt: when },
      );
    });
  });

  describe('setStatus', () => {
    it('issues an updateOne with the new status', async () => {
      await repository.setStatus('admin-1', 'disabled');
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: 'admin-1' },
        { status: 'disabled' },
      );
    });
  });

  describe('count', () => {
    it('delegates to countDocuments', async () => {
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(7),
      });
      expect(await repository.count()).toBe(7);
    });
  });
});
