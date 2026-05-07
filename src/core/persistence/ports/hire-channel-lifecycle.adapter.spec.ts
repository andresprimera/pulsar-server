import { HireChannelLifecycleAdapter } from './hire-channel-lifecycle.adapter';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';

describe('HireChannelLifecycleAdapter', () => {
  let repo: jest.Mocked<
    Pick<
      ClientAgentRepository,
      | 'findActiveByTelegramBotIdForWebhookRegistration'
      | 'updateWebhookRegistrationByTelegramBotId'
      | 'quarantineWebhookRegistration'
      | 'findReconcilableTelegramHires'
    >
  >;
  let adapter: HireChannelLifecycleAdapter;

  beforeEach(() => {
    repo = {
      findActiveByTelegramBotIdForWebhookRegistration: jest.fn(),
      updateWebhookRegistrationByTelegramBotId: jest.fn(),
      quarantineWebhookRegistration: jest.fn(),
      findReconcilableTelegramHires: jest.fn(),
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

  it('quarantineTelegramRegistration delegates to repository', async () => {
    repo.quarantineWebhookRegistration.mockResolvedValue({ matched: true });
    const result = await adapter.quarantineTelegramRegistration({
      telegramBotId: '999',
      lastError: 'r',
    });
    expect(result).toEqual({ matched: true });
    expect(repo.quarantineWebhookRegistration).toHaveBeenCalledWith({
      telegramBotId: '999',
      lastError: 'r',
    });
  });

  it('findReconcilableTelegramHires delegates to repository', async () => {
    repo.findReconcilableTelegramHires.mockResolvedValue([
      {
        clientAgentId: 'a',
        telegramBotId: '999',
        currentStatus: 'pending',
        attemptCount: 0,
      },
    ]);
    const cutoff = new Date();
    const out = await adapter.findReconcilableTelegramHires({
      limit: 10,
      stuckRegisteringCutoff: cutoff,
      quarantineThreshold: 4,
    });
    expect(out).toHaveLength(1);
    expect(repo.findReconcilableTelegramHires).toHaveBeenCalledWith({
      limit: 10,
      stuckRegisteringCutoff: cutoff,
      quarantineThreshold: 4,
    });
  });
});
