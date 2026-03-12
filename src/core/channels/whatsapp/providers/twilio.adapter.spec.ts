import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { TwilioWhatsAppAdapter } from './twilio.adapter';

describe('TwilioWhatsAppAdapter', () => {
  let adapter: TwilioWhatsAppAdapter;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    adapter = new TwilioWhatsAppAdapter();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.WHATSAPP_TWILIO_API_BASE_URL;
  });

  it('has provider set to ChannelProvider.Twilio', () => {
    expect(adapter.provider).toBe(ChannelProvider.Twilio);
  });

  const createPayload = (overrides: Record<string, unknown> = {}) => ({
    MessageSid: 'SM123',
    From: 'whatsapp:+15551234567',
    To: 'whatsapp:+14155238886',
    Body: 'Hello',
    ...overrides,
  });

  describe('parseInbound', () => {
    it('returns ParsedWhatsAppInbound with normalized phoneNumberId (strip whatsapp: prefix)', () => {
      const result = adapter.parseInbound(createPayload());

      expect(result).toEqual({
        phoneNumberId: '+14155238886',
        senderId: '+15551234567',
        messageId: 'SM123',
        text: 'Hello',
      });
    });

    it('returns undefined for payload missing MessageSid', () => {
      expect(
        adapter.parseInbound(createPayload({ MessageSid: undefined })),
      ).toBeUndefined();
    });

    it('returns undefined for payload missing From or To', () => {
      expect(
        adapter.parseInbound(createPayload({ From: undefined })),
      ).toBeUndefined();
      expect(
        adapter.parseInbound(createPayload({ To: undefined })),
      ).toBeUndefined();
    });

    it('returns undefined for invalid shape (not an object)', () => {
      expect(adapter.parseInbound(null)).toBeUndefined();
      expect(adapter.parseInbound('string')).toBeUndefined();
    });

    it('returns undefined when Body is empty and NumMedia > 0 (media-only not supported)', () => {
      const result = adapter.parseInbound(
        createPayload({
          Body: '',
          NumMedia: '1',
          MediaUrl0: 'https://example.com/img.png',
        }),
      );
      expect(result).toBeUndefined();
    });

    it('processes message when Body is non-empty and NumMedia > 0 (text+media)', () => {
      const result = adapter.parseInbound(
        createPayload({ Body: 'Check this', NumMedia: '1' }),
      );
      expect(result).toBeDefined();
      expect(result?.text).toBe('Check this');
    });

    it('returns undefined when Body is empty and no media', () => {
      expect(adapter.parseInbound(createPayload({ Body: '' }))).toBeUndefined();
      expect(
        adapter.parseInbound(createPayload({ Body: '   ' })),
      ).toBeUndefined();
    });

    it('normalizes To without whatsapp: prefix (already E.164)', () => {
      const result = adapter.parseInbound(
        createPayload({ To: '+14155238886' }),
      );
      expect(result?.phoneNumberId).toBe('+14155238886');
    });

    it('normalizes phoneNumberId to E.164 when To has no leading + (so routing matches DB)', () => {
      const result = adapter.parseInbound(
        createPayload({ To: 'whatsapp:14155238886' }),
      );
      expect(result?.phoneNumberId).toBe('+14155238886');
    });

    it('normalizes senderId to E.164 (strips whatsapp: prefix from From)', () => {
      const result = adapter.parseInbound(createPayload());
      expect(result?.senderId).toBe('+15551234567');
    });
  });

  describe('sendMessage', () => {
    it('sends via Twilio REST API with Basic auth and form body', async () => {
      await adapter.sendMessage('+15559999999', 'Hi', {
        phoneNumberId: '+14155238886',
        accountSid: 'AC123',
        authToken: 'token',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
      const rawBody = fetchSpy.mock.calls[0][1].body;
      const bodyStr =
        rawBody instanceof URLSearchParams
          ? rawBody.toString()
          : typeof rawBody === 'string'
          ? rawBody
          : '';
      const params = new URLSearchParams(bodyStr);
      expect(params.get('From')).toBe('whatsapp:+14155238886');
      expect(params.get('To')).toBe('whatsapp:+15559999999');
      expect(params.get('Body')).toBe('Hi');
    });

    it('adds whatsapp: prefix when phoneNumberId has no prefix', async () => {
      await adapter.sendMessage('+15559999999', 'Hi', {
        phoneNumberId: '+14155238886',
        accountSid: 'AC123',
        authToken: 'token',
      });

      const rawBody = fetchSpy.mock.calls[0][1].body;
      const bodyStr =
        rawBody instanceof URLSearchParams
          ? rawBody.toString()
          : typeof rawBody === 'string'
          ? rawBody
          : '';
      const params = new URLSearchParams(bodyStr);
      expect(params.get('From')).toBe('whatsapp:+14155238886');
      expect(params.get('To')).toBe('whatsapp:+15559999999');
    });

    it('uses WHATSAPP_TWILIO_API_BASE_URL from env when set', async () => {
      process.env.WHATSAPP_TWILIO_API_BASE_URL =
        'https://api.custom-twilio.example.com/2010-04-01';
      const adapterWithCustomUrl = new TwilioWhatsAppAdapter();

      await adapterWithCustomUrl.sendMessage('+15559999999', 'Hi', {
        phoneNumberId: '+14155238886',
        accountSid: 'AC123',
        authToken: 'token',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.custom-twilio.example.com/2010-04-01/Accounts/AC123/Messages.json',
        expect.any(Object),
      );
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      } as unknown as Response);

      await expect(
        adapter.sendMessage('+15559999999', 'Hi', {
          phoneNumberId: '+14155238886',
          accountSid: 'AC123',
          authToken: 'bad',
        }),
      ).rejects.toThrow('WhatsApp Twilio API error: 401');
    });
  });

  describe('verifyWebhook', () => {
    it('does not implement verifyWebhook', () => {
      expect((adapter as any).verifyWebhook).toBeUndefined();
    });
  });
});
