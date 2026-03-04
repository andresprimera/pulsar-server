import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { encrypt } from '@shared/crypto.util';

describe('InstagramService', () => {
  let service: InstagramService;
  let incomingMessageOrchestrator: jest.Mocked<IncomingMessageOrchestrator>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env.INSTAGRAM_API_HOST = 'https://graph.facebook.com';
    process.env.INSTAGRAM_API_VERSION = 'v24.0';
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'ig-token';
    delete process.env.INSTAGRAM_APP_SECRET;

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
    } as unknown as Response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstagramService,
        {
          provide: IncomingMessageOrchestrator,
          useValue: { handle: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(InstagramService);
    incomingMessageOrchestrator = module.get(IncomingMessageOrchestrator);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.INSTAGRAM_API_HOST;
    delete process.env.INSTAGRAM_API_VERSION;
    delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  });

  it('verifies webhook token', () => {
    expect(service.verifyWebhook('subscribe', 'ig-token', 'challenge')).toBe(
      'challenge',
    );
  });

  it('rejects invalid webhook token', () => {
    expect(() =>
      service.verifyWebhook('subscribe', 'wrong-token', 'challenge'),
    ).toThrow(ForbiddenException);
  });

  it('delegates to orchestrator and sends reply when returned', async () => {
    const accessToken = 'ig-access-token';
    const encryptedCreds = {
      instagramAccountId: encrypt('17841400000000000'),
      accessToken: encrypt(accessToken),
    };

    incomingMessageOrchestrator.handle.mockResolvedValue({
      reply: { type: 'text', text: 'Instagram reply' },
      channelMeta: { encryptedCredentials: encryptedCreds },
    });

    await service.handleIncoming({
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user_123' },
              recipient: { id: '17841400000000000' },
              timestamp: Date.now(),
              message: { mid: 'mid.1', text: 'hello from ig' },
            },
          ],
        },
      ],
    });

    expect(incomingMessageOrchestrator.handle).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/me/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
        body: expect.stringContaining('Instagram reply'),
      }),
    );
  });

  it('does not send reply when orchestrator returns undefined reply', async () => {
    incomingMessageOrchestrator.handle.mockResolvedValue({});

    await service.handleIncoming({
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user_123' },
              recipient: { id: '17841400000000000' },
              message: { text: 'hello from ig' },
            },
          ],
        },
      ],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
