import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { TiktokService } from './tiktok.service';
import { AgentService } from '../../agent/agent.service';
import { AgentRoutingService } from '../shared/agent-routing.service';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { AgentContextService } from '../../agent/agent-context.service';
import { ContactRepository } from '../../database/repositories/contact.repository';
import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
import { AgentOutput } from '../../agent/contracts/agent-output';
import { encrypt } from '../../database/utils/crypto.util';

describe('TiktokService', () => {
  let service: TiktokService;
  let agentService: jest.Mocked<AgentService>;
  let agentRoutingService: jest.Mocked<AgentRoutingService>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let contactRepository: jest.Mocked<ContactRepository>;
  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    process.env.TIKTOK_API_BASE_URL = 'https://business-api.tiktok.com/open_api/v1.2';

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
    } as unknown as Response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiktokService,
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
          provide: ContactRepository,
          useValue: { findOrCreateByExternalIdentity: jest.fn() },
        },
        {
          provide: ContactIdentifierExtractorRegistry,
          useValue: {
            resolve: jest.fn().mockReturnValue({
              externalId: 'sender_456',
              externalIdRaw: 'sender_456',
              identifierType: 'platform_id',
            }),
          },
        },
        {
          provide: AgentContextService,
          useValue: {
            enrichContext: jest.fn().mockImplementation((ctx) => Promise.resolve(ctx)),
          },
        },
      ],
    }).compile();

    service = module.get<TiktokService>(TiktokService);
    agentService = module.get(AgentService);
    agentRoutingService = module.get(AgentRoutingService);
    agentRepository = module.get(AgentRepository);
    contactRepository = module.get(ContactRepository);
    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);

    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
      loggerLogSpy.mockRestore();
      loggerWarnSpy.mockRestore();
      loggerErrorSpy.mockRestore();
      fetchSpy.mockRestore();
      delete process.env.TIKTOK_API_BASE_URL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

    const accessToken = 'test_access_token';
    const encryptedCredentials = {
          tiktokUserId: 'tiktok_user_123',
          accessToken: accessToken,
    };
    const encryptedCredsRecord = {};
    for (const key in encryptedCredentials) {
        encryptedCredsRecord[key] = encrypt(encryptedCredentials[key]);
    }

    const mockClientAgent = {
        agentId: 'agent_007',
        clientId: '507f1f77bcf86cd799439011',
        channels: [
          {
            status: 'active',
            channelId: '507f1f77bcf86cd799439014',
            credentials: encryptedCredsRecord,
            llmConfig: { provider: 'openai', apiKey: 'key' },
          },
        ],
    };

    const mockAgent = {
        systemPrompt: 'You are a helpful assistant.',
    };

    it('should ignore non-message events', async () => {
      await service.handleIncoming(createPayload({ root: { event: 'other_event' } }));
      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
    });

    it('should ignore messages without text', async () => {
      await service.handleIncoming(createPayload({ message: { type: 'image' } }));
      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
    });

    it('should ignore messages without recipient user_id', async () => {
        await service.handleIncoming(createPayload({ recipient: { user_id: undefined } }));
        expect(loggerWarnSpy).toHaveBeenCalledWith('[TikTok] Missing recipient.user_id in payload.');
        expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
    });

    it('should log warning when no ClientAgent found for tiktokUserId', async () => {
        agentRoutingService.resolveRoute.mockResolvedValue({ kind: 'unroutable', reason: 'no-candidates' });
        await service.handleIncoming(createPayload());
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            '[TikTok] No active ClientAgent found for tiktokUserId=tiktok_user_123.',
        );
        expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should log warning when channel config mismatch in ClientAgent', async () => {
        agentRoutingService.resolveRoute.mockResolvedValue({ kind: 'unroutable', reason: 'no-candidates' });
        await service.handleIncoming(createPayload());
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            '[TikTok] No active ClientAgent found for tiktokUserId=tiktok_user_123.',
        );
         expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should process valid text message and send reply', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue({
        kind: 'resolved',
        candidate: {
          clientAgent: mockClientAgent,
          channelConfig: mockClientAgent.channels[0],
          agentName: 'Test Agent',
        },
      } as any);
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
      } as any);
      agentService.run.mockResolvedValue({
        reply: { text: 'Hello back!', type: 'text' },
      });

      await service.handleIncoming(createPayload());

      expect(agentRoutingService.resolveRoute).toHaveBeenCalled();
      expect(agentService.run).toHaveBeenCalled();
      
      // Verify fetch was called with correct args
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/message/send/'),
        expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Hello back!'),
            headers: expect.objectContaining({
                Authorization: `Bearer ${accessToken}`
            })
        })
      );
      expect(loggerLogSpy).toHaveBeenCalledWith('[TikTok] Reply sent successfully.');
    });

    it('should handle API errors when sending reply', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue({
        kind: 'resolved',
        candidate: {
          clientAgent: mockClientAgent,
          channelConfig: mockClientAgent.channels[0],
          agentName: 'Test Agent',
        },
      } as any);
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
      } as any);
      agentService.run.mockResolvedValue({
        reply: { text: 'Hello back!', type: 'text' },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      } as unknown as Response);

      await expect(service.handleIncoming(createPayload())).resolves.not.toThrow();
      expect(fetchSpy).toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send reply'));
    });
  });
});
