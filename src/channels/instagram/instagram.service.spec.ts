import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { AgentService } from '../../agent/agent.service';
import { AgentRoutingService } from '../shared/agent-routing.service';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { AgentContextService } from '../../agent/agent-context.service';
import { encrypt } from '../../database/utils/crypto.util';

describe('InstagramService', () => {
  let service: InstagramService;
  let agentService: jest.Mocked<AgentService>;
  let agentRoutingService: jest.Mocked<AgentRoutingService>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let loggerWarnSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

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
          provide: AgentService,
          useValue: { run: jest.fn() },
        },
        {
          provide: AgentRoutingService,
          useValue: { resolveRoute: jest.fn() },
        },
        {
          provide: AgentRepository,
          useValue: { findActiveById: jest.fn() },
        },
        {
          provide: AgentContextService,
          useValue: {
            enrichContext: jest.fn().mockImplementation((ctx) => Promise.resolve(ctx)),
          },
        },
      ],
    }).compile();

    service = module.get(InstagramService);
    agentService = module.get(AgentService);
    agentRoutingService = module.get(AgentRoutingService);
    agentRepository = module.get(AgentRepository);

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    fetchSpy.mockRestore();
    delete process.env.INSTAGRAM_API_HOST;
    delete process.env.INSTAGRAM_API_VERSION;
    delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should verify webhook token', () => {
    expect(service.verifyWebhook('subscribe', 'ig-token', 'challenge')).toBe(
      'challenge',
    );
  });

  it('should reject invalid webhook token', () => {
    expect(() =>
      service.verifyWebhook('subscribe', 'wrong-token', 'challenge'),
    ).toThrow(ForbiddenException);
  });

  it('should process valid inbound text and send reply', async () => {
    const accessToken = 'ig-access-token';
    const encryptedCreds = {
      instagramAccountId: encrypt('17841400000000000'),
      accessToken: encrypt(accessToken),
    };

    agentRoutingService.resolveRoute.mockResolvedValue({
      kind: 'resolved',
      candidate: {
        clientAgent: {
          agentId: 'agent_1',
          clientId: 'client_1',
        },
        channelConfig: {
          channelId: 'channel_1',
          credentials: encryptedCreds,
          llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o' },
        },
        agentName: 'Agent',
      },
    } as any);

    agentRepository.findActiveById.mockResolvedValue({
      systemPrompt: 'prompt',
    } as any);

    agentService.run.mockResolvedValue({
      reply: { type: 'text', text: 'Instagram reply' },
    } as any);

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

    expect(agentService.run).toHaveBeenCalledTimes(1);
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

  it('should ignore unroutable messages', async () => {
    agentRoutingService.resolveRoute.mockResolvedValue({
      kind: 'unroutable',
      reason: 'no-candidates',
    });

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

    expect(agentService.run).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[Instagram] No active ClientAgent found for instagramAccountId=17841400000000000.',
    );
  });
});
