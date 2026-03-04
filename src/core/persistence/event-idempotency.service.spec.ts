import { Test, TestingModule } from '@nestjs/testing';
import { EventIdempotencyService } from './event-idempotency.service';
import { ProcessedEventRepository } from '@persistence/repositories/processed-event.repository';

describe('EventIdempotencyService', () => {
  let service: EventIdempotencyService;
  let repository: jest.Mocked<ProcessedEventRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventIdempotencyService,
        {
          provide: ProcessedEventRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventIdempotencyService>(EventIdempotencyService);
    repository = module.get(ProcessedEventRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerIfFirst', () => {
    it('should return true when event is new', async () => {
      repository.create.mockResolvedValue(undefined);

      const result = await service.registerIfFirst({
        channel: 'whatsapp',
        messageId: 'msg-001',
      });

      expect(result).toBe(true);
      expect(repository.create).toHaveBeenCalledWith('whatsapp', 'msg-001');
    });

    it('should return false when event is a duplicate (Mongo 11000)', async () => {
      const duplicateError = Object.assign(new Error('duplicate key'), {
        code: 11000,
      });
      repository.create.mockRejectedValue(duplicateError);

      const result = await service.registerIfFirst({
        channel: 'whatsapp',
        messageId: 'msg-001',
      });

      expect(result).toBe(false);
    });

    it('should rethrow unexpected errors', async () => {
      const unexpectedError = new Error('connection failed');
      repository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.registerIfFirst({
          channel: 'whatsapp',
          messageId: 'msg-001',
        }),
      ).rejects.toThrow('connection failed');
    });
  });
});
