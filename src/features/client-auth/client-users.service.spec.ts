import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { ClientUsersService } from './client-users.service';
import { UserRepository } from '@persistence/repositories/user.repository';

describe('ClientUsersService', () => {
  let service: ClientUsersService;
  let userRepository: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    userRepository = {
      findById: jest.fn(),
      findByEmailWithPasswordHash: jest.fn(),
      setPasswordHash: jest.fn(),
      setLastLoginAt: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientUsersService,
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    service = moduleRef.get(ClientUsersService);
  });

  describe('setPasswordHash', () => {
    it('hashes the plaintext with argon2id and persists the hash', async () => {
      const hashSpy = jest
        .spyOn(argon2, 'hash')
        .mockResolvedValue('argon2id-hash');

      await service.setPasswordHash('user-1', 'plain-pw');

      expect(hashSpy).toHaveBeenCalledWith('plain-pw', {
        type: argon2.argon2id,
      });
      expect(userRepository.setPasswordHash).toHaveBeenCalledWith(
        'user-1',
        'argon2id-hash',
      );

      hashSpy.mockRestore();
    });
  });

  describe('verifyPassword', () => {
    it('delegates to argon2.verify', async () => {
      const verifySpy = jest.spyOn(argon2, 'verify').mockResolvedValue(true);

      const result = await service.verifyPassword('hash', 'plain');

      expect(verifySpy).toHaveBeenCalledWith('hash', 'plain');
      expect(result).toBe(true);

      verifySpy.mockRestore();
    });
  });

  describe('findById / findByEmailWithPasswordHash / setLastLoginAt', () => {
    it('forwards to the repository', async () => {
      await service.findById('user-1');
      expect(userRepository.findById).toHaveBeenCalledWith('user-1');

      await service.findByEmailWithPasswordHash('a@b.com');
      expect(userRepository.findByEmailWithPasswordHash).toHaveBeenCalledWith(
        'a@b.com',
      );

      const when = new Date();
      await service.setLastLoginAt('user-1', when);
      expect(userRepository.setLastLoginAt).toHaveBeenCalledWith(
        'user-1',
        when,
      );
    });
  });
});
