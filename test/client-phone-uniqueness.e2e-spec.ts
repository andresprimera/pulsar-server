import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ConflictException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ClientPhoneRepository } from '../src/core/persistence/repositories/client-phone.repository';
import { Types } from 'mongoose';

describe('ClientPhoneRepository (E2E)', () => {
  let app: INestApplication;
  let repository: ClientPhoneRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    repository = app.get<ClientPhoneRepository>(ClientPhoneRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Global Uniqueness Enforcement', () => {
    const phoneId = `e2e-test-phone-${Date.now()}`;
    const clientA = new Types.ObjectId();
    const clientB = new Types.ObjectId();

    afterAll(async () => {
      // Cleanup
      await repository.deleteByClient(clientA);
      // Client B creation should fail, so no need to delete, but for safety:
      await repository.deleteByClient(clientB);
    });

    it('should create a phone number for Client A successfully', async () => {
      const result = await repository.create({
        clientId: clientA,
        phoneNumberId: phoneId,
        provider: 'custom',
      });
      expect(result).toBeDefined();
      expect(result.phoneNumberId).toBe(phoneId);
      expect(result.clientId.toString()).toBe(clientA.toString());
    });

    it('should fail to create the SAME phone number for Client B', async () => {
      await expect(
        repository.create({
          clientId: clientB,
          phoneNumberId: phoneId,
          provider: 'custom',
        }),
      ).rejects.toThrow(); // Expect duplicate key error (which is thrown directly by create)
    });

    it('should throw ConflictException when resolveOrCreate is called for Client B', async () => {
      await expect(
        repository.resolveOrCreate(clientB, phoneId),
      ).rejects.toThrow(ConflictException);
    });

    it('should return existing record when resolveOrCreate is called for Client A', async () => {
      const result = await repository.resolveOrCreate(clientA, phoneId);
      expect(result).toBeDefined();
      expect(result.clientId.toString()).toBe(clientA.toString());
    });
  });
});
