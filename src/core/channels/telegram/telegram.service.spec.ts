import { TelegramService } from './telegram.service';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { TelegramWebhookAuthService } from '@orchestrator/telegram-webhook-auth.service';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { RecoverableJobError } from '@orchestrator/errors/job-errors';

describe('TelegramService', () => {
  let service: TelegramService;
  let orchestrator: jest.Mocked<Pick<IncomingMessageOrchestrator, 'handle'>>;
  let webhookAuth: jest.Mocked<
    Pick<TelegramWebhookAuthService, 'assertValidWebhookSecret'>
  >;

  beforeEach(() => {
    orchestrator = { handle: jest.fn() };
    webhookAuth = {
      assertValidWebhookSecret: jest.fn().mockResolvedValue(undefined),
    };
    service = new TelegramService(
      orchestrator as unknown as IncomingMessageOrchestrator,
      webhookAuth as unknown as TelegramWebhookAuthService,
    );
  });

  it('parseTextMessageUpdate returns null for non-message updates', () => {
    expect(service.parseTextMessageUpdate({ update_id: 1 })).toBeNull();
  });

  it('parseTextMessageUpdate extracts text user chat and message id', () => {
    const parsed = service.parseTextMessageUpdate({
      update_id: 2,
      message: {
        message_id: 42,
        chat: { id: -100123, type: 'supergroup' },
        from: { id: 555666777, is_bot: false, first_name: 'U' },
        text: 'hello',
      },
    });
    expect(parsed).toEqual({
      text: 'hello',
      fromUserId: 555666777,
      chatId: -100123,
      messageId: 42,
    });
  });

  it('calls orchestrator with telegram channel and composite messageId', async () => {
    orchestrator.handle.mockResolvedValue(undefined);
    await service.handleIncoming(
      '123456789',
      {
        update_id: 1,
        message: {
          message_id: 7,
          chat: { id: 99, type: 'private' },
          from: { id: 1001, is_bot: false, first_name: 'A' },
          text: 'ping',
        },
      },
      'any-secret',
    );
    expect(webhookAuth.assertValidWebhookSecret).toHaveBeenCalledWith(
      '123456789',
      'any-secret',
    );
    expect(orchestrator.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: CHANNEL_TYPES.TELEGRAM,
        routeChannelIdentifier: '123456789',
        channelIdentifier: '1001',
        messageId: '99:7',
        text: 'ping',
      }),
    );
  });

  describe('lifecycle.registerWebhook', () => {
    const PUBLIC_BASE_URL = 'https://api.example.com';
    const BOT_ID = '123456789';
    const BOT_TOKEN = '123456789:ABCDEFG_token-value';
    const fetchSpy = jest.spyOn(global, 'fetch' as any);

    afterEach(() => {
      fetchSpy.mockReset();
    });

    function okResponse(body: unknown, status = 200): Response {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('POSTs to setWebhook with correct URL, secret_token and allowed_updates and returns registered=true', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ ok: true }));

      const result = await service.lifecycle.registerWebhook({
        kind: 'plaintext',
        telegramBotId: BOT_ID,
        botToken: BOT_TOKEN,
        publicBaseUrl: PUBLIC_BASE_URL,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.url).toBe(`${PUBLIC_BASE_URL}/telegram/webhook/${BOT_ID}`);
      expect(typeof body.secret_token).toBe('string');
      expect(body.secret_token).toHaveLength(64);
      expect(body.drop_pending_updates).toBe(false);
      expect(body.allowed_updates).toEqual(['message']);

      expect(result.registered).toBe(true);
      expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns registered=false on 401/403/400 with sanitized error', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(`unauthorized for ${BOT_TOKEN}`, { status: 401 }),
      );

      const result = await service.lifecycle.registerWebhook({
        kind: 'plaintext',
        telegramBotId: BOT_ID,
        botToken: BOT_TOKEN,
        publicBaseUrl: PUBLIC_BASE_URL,
      });

      expect(result.registered).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).not.toContain(BOT_TOKEN);
      expect(result.error).toContain('[REDACTED]');
    });

    it('throws RecoverableJobError on 5xx', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('server', { status: 502 }));

      await expect(
        service.lifecycle.registerWebhook({
          kind: 'plaintext',
          telegramBotId: BOT_ID,
          botToken: BOT_TOKEN,
          publicBaseUrl: PUBLIC_BASE_URL,
        }),
      ).rejects.toBeInstanceOf(RecoverableJobError);
    });

    it('throws RecoverableJobError on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      await expect(
        service.lifecycle.registerWebhook({
          kind: 'plaintext',
          telegramBotId: BOT_ID,
          botToken: BOT_TOKEN,
          publicBaseUrl: PUBLIC_BASE_URL,
        }),
      ).rejects.toBeInstanceOf(RecoverableJobError);
    });

    it('handles encrypted credentials by extracting botToken via decryptRecord', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ ok: true }));

      const result = await service.lifecycle.registerWebhook({
        kind: 'encrypted',
        telegramBotId: BOT_ID,
        encryptedCredentials: { botToken: BOT_TOKEN },
        publicBaseUrl: PUBLIC_BASE_URL,
      });

      expect(result.registered).toBe(true);
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain(BOT_TOKEN);
    });

    it('returns deterministic fingerprint for same url and bot token', async () => {
      fetchSpy.mockResolvedValue(okResponse({ ok: true }));

      const a = await service.lifecycle.registerWebhook({
        kind: 'plaintext',
        telegramBotId: BOT_ID,
        botToken: BOT_TOKEN,
        publicBaseUrl: PUBLIC_BASE_URL,
      });
      const b = await service.lifecycle.registerWebhook({
        kind: 'plaintext',
        telegramBotId: BOT_ID,
        botToken: BOT_TOKEN,
        publicBaseUrl: PUBLIC_BASE_URL,
      });

      expect(a.fingerprint).toBe(b.fingerprint);
    });
  });
});
