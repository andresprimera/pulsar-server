import { ForbiddenException } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { MetaWhatsAppAdapter } from './meta.adapter';

describe('MetaWhatsAppAdapter', () => {
  let adapter: MetaWhatsAppAdapter;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.WHATSAPP_API_HOST = 'http://localhost:3005';
    process.env.WHATSAPP_API_VERSION = 'v18.0';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-token';
    adapter = new MetaWhatsAppAdapter();

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.WHATSAPP_API_HOST;
    delete process.env.WHATSAPP_API_VERSION;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  });

  it('has provider set to ChannelProvider.Meta', () => {
    expect(adapter.provider).toBe(ChannelProvider.Meta);
  });

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
            },
          },
        ],
      },
    ],
  });

  describe('parseInbound', () => {
    it('delegates to shared Cloud API parser and returns result', () => {
      const result = adapter.parseInbound(createPayload());

      expect(result).toEqual({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });
    });

    it('returns undefined for invalid payload', () => {
      expect(adapter.parseInbound({})).toBeUndefined();
    });
  });

  describe('sendMessage', () => {
    it('sends via Meta Cloud API with Bearer auth', async () => {
      await adapter.sendMessage('1234567890', 'Hello', {
        phoneNumberId: 'phone123',
        accessToken: 'wa-token',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3005/v18.0/phone123/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer wa-token',
          }),
        }),
      );
    });

    it('does not log message content or credentials', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const loggerSpy = jest
        .spyOn((adapter as any).logger, 'log')
        .mockImplementation();

      await adapter.sendMessage('1234567890', 'Secret message', {
        phoneNumberId: 'phone123',
        accessToken: 'secret-token',
      });

      const allLogCalls = [
        ...logSpy.mock.calls.map((c) => c.join(' ')),
        ...loggerSpy.mock.calls.map((c) => c.join(' ')),
      ].join('\n');

      expect(allLogCalls).not.toContain('Secret message');
      expect(allLogCalls).not.toContain('secret-token');

      logSpy.mockRestore();
      loggerSpy.mockRestore();
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      } as unknown as Response);

      await expect(
        adapter.sendMessage('1234567890', 'Hello', {
          phoneNumberId: 'phone123',
          accessToken: 'bad-token',
        }),
      ).rejects.toThrow('WhatsApp Meta API error: 401');
    });
  });

  describe('verifyWebhook', () => {
    it('returns challenge on valid verification', () => {
      expect(
        adapter.verifyWebhook('subscribe', 'test-token', 'challenge123'),
      ).toBe('challenge123');
    });

    it('throws ForbiddenException on invalid token', () => {
      expect(() =>
        adapter.verifyWebhook('subscribe', 'wrong-token', 'challenge123'),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException on invalid mode', () => {
      expect(() =>
        adapter.verifyWebhook('unsubscribe', 'test-token', 'challenge123'),
      ).toThrow(ForbiddenException);
    });
  });
});
