import { TelegramService } from './telegram.service';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { TelegramWebhookAuthService } from '@orchestrator/telegram-webhook-auth.service';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';

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
});
