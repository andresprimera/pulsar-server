import { Test, TestingModule } from '@nestjs/testing';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';

describe('InstagramController', () => {
  let controller: InstagramController;
  let service: jest.Mocked<InstagramService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstagramController],
      providers: [
        {
          provide: InstagramService,
          useValue: {
            verifyWebhook: jest.fn(),
            handleIncoming: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InstagramController>(InstagramController);
    service = module.get(InstagramService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate webhook verification to service', () => {
    service.verifyWebhook.mockReturnValue('challenge');

    const result = controller.verify('subscribe', 'token', 'challenge');

    expect(service.verifyWebhook).toHaveBeenCalledWith(
      'subscribe',
      'token',
      'challenge',
    );
    expect(result).toBe('challenge');
  });

  it('should call service.handleIncoming and return ok', async () => {
    service.handleIncoming.mockResolvedValue(undefined);

    const result = await controller.handleWebhook(
      { entry: [] },
      'sha256=abc',
      { rawBody: Buffer.from('{}') } as any,
    );

    expect(service.handleIncoming).toHaveBeenCalledWith(
      { entry: [] },
      'sha256=abc',
      Buffer.from('{}'),
    );
    expect(result).toBe('ok');
  });
});
