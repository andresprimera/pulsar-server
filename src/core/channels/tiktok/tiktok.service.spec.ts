import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { TiktokService } from './tiktok.service';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { encrypt } from '@shared/crypto.util';

describe('TiktokService', () => {
  let service: TiktokService;
  let incomingMessageOrchestrator: jest.Mocked<IncomingMessageOrchestrator>;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env.TIKTOK_API_BASE_URL =
      'https://business-api.tiktok.com/open_api/v1.2';
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
    } as unknown as Response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiktokService,
        {
          provide: IncomingMessageOrchestrator,
          useValue: { handle: jest.fn() },
        },
        {
          provide: ChannelEnvService,
          useValue: {
            getTikTokCredentials: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(TiktokService);
    incomingMessageOrchestrator = module.get(IncomingMessageOrchestrator);

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    fetchSpy.mockRestore();
    delete process.env.TIKTOK_API_BASE_URL;
  });

  describe('handleIncoming', () => {
    const createPayload = (overrides: any = {}) => ({
      event: 'message.received',
      data: {
        message: {
          type: 'text',
          text: 'Hello',
          ...overrides.message,
        },
        recipient: {
          user_id: 'tiktok_user_123',
          ...overrides.recipient,
        },
        sender: {
          user_id: 'sender_456',
          username: 'sender_user',
          ...overrides.sender,
        },
        conversation_id: 'conv_789',
        message_id: 'msg_111',
        ...overrides.data,
      },
      ...overrides.root,
    });

    it('returns early for invalid payload shapes', async () => {
      await service.handleIncoming(
        createPayload({ root: { event: 'other_event' } }),
      );
      await service.handleIncoming(
        createPayload({ message: { type: 'image' } }),
      );
      await service.handleIncoming(
        createPayload({ recipient: { user_id: undefined } }),
      );
      await service.handleIncoming(
        createPayload({ sender: { user_id: undefined } }),
      );

      expect(incomingMessageOrchestrator.handle).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('sends reply when orchestrator returns one', async () => {
      const encryptedCredentials = {
        tiktokUserId: encrypt('tiktok_user_123'),
        accessToken: encrypt('test_access_token'),
      };
      incomingMessageOrchestrator.handle.mockResolvedValue({
        reply: { text: 'Hello back!', type: 'text' },
        channelMeta: { encryptedCredentials },
      });

      await service.handleIncoming(createPayload());

      expect(incomingMessageOrchestrator.handle).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/message/send/'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello back!'),
        }),
      );
    });

    it('does not send when reply is undefined', async () => {
      incomingMessageOrchestrator.handle.mockResolvedValue({});

      await service.handleIncoming(createPayload());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('logs send errors and does not throw', async () => {
      const encryptedCredentials = {
        tiktokUserId: encrypt('tiktok_user_123'),
        accessToken: encrypt('test_access_token'),
      };
      incomingMessageOrchestrator.handle.mockResolvedValue({
        reply: { text: 'Hello back!', type: 'text' },
        channelMeta: { encryptedCredentials },
      });
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      } as unknown as Response);

      await expect(
        service.handleIncoming(createPayload()),
      ).resolves.not.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send reply'),
      );
    });
  });

  describe('ChannelAdapter sendMessage (Phase 2)', () => {
    it('declares channel = tiktok', () => {
      expect(service.channel).toBe('tiktok');
    });

    it('POSTs to the TikTok messages endpoint with passthrough recipient', async () => {
      const accessToken = 'tt-token-3';

      await service.sendMessage({
        to: 'tiktok_recipient_user',
        message: 'operator outbound',
        credentials: { accessToken: encrypt(accessToken) },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/message/send/');
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${accessToken}`);
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.recipient_id).toBe('tiktok_recipient_user');
      expect(body.text.content).toBe('operator outbound');
    });

    it('throws when no credentials and no env fallback', async () => {
      await expect(
        service.sendMessage({
          to: 'tiktok_recipient_user',
          message: 'x',
          credentials: undefined,
        }),
      ).rejects.toThrow(/No credentials/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
