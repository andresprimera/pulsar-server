import { HireChannelLifecycleAdapter } from './hire-channel-lifecycle.adapter';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';

describe('HireChannelLifecycleAdapter', () => {
  let repo: jest.Mocked<
    Pick<
      ClientAgentRepository,
      | 'findActiveByTelegramBotIdForWebhookRegistration'
      | 'updateWebhookRegistrationByTelegramBotId'
    >
  >;
  let adapter: HireChannelLifecycleAdapter;

  beforeEach(() => {
    repo = {
      findActiveByTelegramBotIdForWebhookRegistration: jest.fn(),
      updateWebhookRegistrationByTelegramBotId: jest.fn(),
    } as any;
    adapter = new HireChannelLifecycleAdapter(repo as any);
  });

  it('recordOutcome delegates to repository', async () => {
    repo.updateWebhookRegistrationByTelegramBotId.mockResolvedValue({
      matched: true,
    });
    const out = await adapter.recordOutcome({
      telegramBotId: '123',
      status: 'registered',
      fingerprint: 'fp',
    });
    expect(out).toEqual({ matched: true });
    expect(repo.updateWebhookRegistrationByTelegramBotId).toHaveBeenCalledWith({
      telegramBotId: '123',
      status: 'registered',
      fingerprint: 'fp',
    });
  });

  it('loadForRegistration returns null when no agents found', async () => {
    repo.findActiveByTelegramBotIdForWebhookRegistration.mockResolvedValue([]);
    const result = await adapter.loadForRegistration('999');
    expect(result).toBeNull();
  });

  it('loadForRegistration returns null when matching channel has no credentials', async () => {
    repo.findActiveByTelegramBotIdForWebhookRegistration.mockResolvedValue([
      {
        channels: [
          {
            status: 'active',
            telegramBotId: '999',
            credentials: null,
          },
        ],
      } as any,
    ]);
    const result = await adapter.loadForRegistration('999');
    expect(result).toBeNull();
  });

  it('loadForRegistration returns credentials and webhook registration snapshot', async () => {
    repo.findActiveByTelegramBotIdForWebhookRegistration.mockResolvedValue([
      {
        channels: [
          {
            status: 'active',
            telegramBotId: '999',
            credentials: { botToken: 'enc' },
            webhookRegistration: {
              status: 'registered',
              fingerprint: 'fp',
            },
          },
        ],
      } as any,
    ]);

    const result = await adapter.loadForRegistration('999');
    expect(result).toEqual({
      encryptedCredentials: { botToken: 'enc' },
      webhookRegistration: { status: 'registered', fingerprint: 'fp' },
    });
  });
});
