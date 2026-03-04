import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { encrypt } from '@shared/crypto.util';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let incomingMessageOrchestrator: jest.Mocked<IncomingMessageOrchestrator>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-token';
    process.env.WHATSAPP_API_HOST = 'http://localhost:3005';
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: IncomingMessageOrchestrator,
          useValue: { handle: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    incomingMessageOrchestrator = module.get(IncomingMessageOrchestrator);
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    fetchSpy.mockRestore();
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_API_HOST;
  });

  describe('verifyWebhook', () => {
    it('returns challenge when mode is subscribe and token is valid', () => {
      expect(
        service.verifyWebhook('subscribe', 'test-token', 'challenge123'),
      ).toBe('challenge123');
    });

    it('throws ForbiddenException when token is invalid', () => {
      expect(() =>
        service.verifyWebhook('subscribe', 'wrong-token', 'challenge123'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('handleIncoming', () => {
    const createPayload = (overrides: any = {}) => ({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '1234567890',
                    id: 'msg123',
                    type: 'text',
                    text: { body: 'Hello' },
                    ...overrides.message,
                  },
                ],
                metadata: {
                  phone_number_id: 'phone123',
                  ...overrides.metadata,
                },
                ...overrides.value,
              },
              ...overrides.change,
            },
          ],
          ...overrides.entry,
        },
      ],
      ...overrides.root,
    });

    const encryptedCredentials = {
      phoneNumberId: encrypt('phone123'),
      accessToken: encrypt('wa-token'),
    };

    it('maps payload to incoming event and delegates to orchestrator', async () => {
      incomingMessageOrchestrator.handle.mockResolvedValue(undefined);
      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(incomingMessageOrchestrator.handle).toHaveBeenCalledWith({
        channelId: CHANNEL_TYPES.WHATSAPP,
        routeChannelIdentifier: 'phone123',
        channelIdentifier: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
        rawPayload: payload,
      });
    });

    it('sends outbound message when orchestrator returns reply with channelMeta', async () => {
      incomingMessageOrchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Echo response' },
        channelMeta: { encryptedCredentials },
      });

      await service.handleIncoming(createPayload());

      expect(fetchSpy).toHaveBeenCalled();
      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[WhatsApp] Sending to 1234567890: Echo response',
      );
    });

    it('does not send outbound when orchestrator reply is undefined', async () => {
      incomingMessageOrchestrator.handle.mockResolvedValue({});

      await service.handleIncoming(createPayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('logs API error and does not throw', async () => {
      incomingMessageOrchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Echo response' },
        channelMeta: { encryptedCredentials },
      });
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Error'),
      } as unknown as Response);

      await expect(
        service.handleIncoming(createPayload()),
      ).resolves.not.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WhatsApp] Failed to send reply'),
      );
    });

    it('returns early on invalid payload and does not call orchestrator', async () => {
      await service.handleIncoming({});
      await service.handleIncoming({
        entry: [{ changes: [{ value: { messages: [{ type: 'image' }] } }] }],
      });
      await service.handleIncoming({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {},
                  messages: [
                    {
                      from: '1234567890',
                      id: 'msg123',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(incomingMessageOrchestrator.handle).not.toHaveBeenCalled();
    });
  });
});
