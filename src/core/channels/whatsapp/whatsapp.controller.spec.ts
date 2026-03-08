import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { WhatsappController } from './whatsapp.controller';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppProviderRouter } from './provider-router';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: jest.Mocked<WhatsAppChannelService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsAppChannelService,
          useValue: {
            verifyMetaWebhook: jest.fn(),
            handleIncoming: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WhatsAppProviderRouter,
          useValue: {
            hasAdapter: jest.fn((p: string) =>
              [ChannelProvider.Meta, ChannelProvider.Dialog360].includes(
                p as ChannelProvider,
              ),
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    service = module.get(WhatsAppChannelService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verify', () => {
    it('delegates to service.verifyMetaWebhook()', () => {
      service.verifyMetaWebhook.mockReturnValue('challenge123');

      const result = controller.verify(
        'subscribe',
        'test-token',
        'challenge123',
      );

      expect(service.verifyMetaWebhook).toHaveBeenCalledWith(
        'subscribe',
        'test-token',
        'challenge123',
      );
      expect(result).toBe('challenge123');
    });
  });

  describe('handleWebhook', () => {
    it('calls service.handleIncoming with ChannelProvider.Meta and returns ok', async () => {
      const payload = { entry: [] };

      const result = await controller.handleWebhook(payload);

      expect(service.handleIncoming).toHaveBeenCalledWith(
        payload,
        ChannelProvider.Meta,
      );
      expect(result).toBe('ok');
    });
  });

  describe('handleProviderWebhook', () => {
    it('calls service.handleIncoming with the specified provider', async () => {
      const payload = { entry: [] };

      const result = await controller.handleProviderWebhook(
        payload,
        ChannelProvider.Dialog360,
      );

      expect(service.handleIncoming).toHaveBeenCalledWith(
        payload,
        ChannelProvider.Dialog360,
      );
      expect(result).toBe('ok');
    });

    it('calls service.handleIncoming with provider "meta"', async () => {
      const payload = { entry: [] };

      const result = await controller.handleProviderWebhook(
        payload,
        ChannelProvider.Meta,
      );

      expect(service.handleIncoming).toHaveBeenCalledWith(
        payload,
        ChannelProvider.Meta,
      );
      expect(result).toBe('ok');
    });

    it('throws BadRequestException for unsupported provider', async () => {
      await expect(
        controller.handleProviderWebhook({}, 'unsupported'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
