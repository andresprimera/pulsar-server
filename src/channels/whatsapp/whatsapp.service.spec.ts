import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';

import { WhatsappService } from './whatsapp.service';
import { AgentService } from '../../agent/agent.service';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { LlmProvider } from '../../agent/llm/provider.enum';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let agentService: jest.Mocked<AgentService>;
  let clientAgentRepository: jest.Mocked<ClientAgentRepository>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Set env vars for server-level WhatsApp config
    process.env.WHATSAPP_API_HOST = 'http://localhost:3005';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-token';

    // Mock global fetch to prevent real HTTP calls
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: AgentService,
          useValue: { run: jest.fn() },
        },
        {
          provide: ClientAgentRepository,
          useValue: { findOneByPhoneNumberId: jest.fn() },
        },
        {
          provide: AgentRepository,
          useValue: { findActiveById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    agentService = module.get(AgentService);
    clientAgentRepository = module.get(ClientAgentRepository);
    agentRepository = module.get(AgentRepository);

    // Spy on Logger.prototype since a new Logger() is instantiated in the service
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    fetchSpy.mockRestore();
    delete process.env.WHATSAPP_API_HOST;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyWebhook', () => {
    it('should return challenge when mode is subscribe and token is valid', () => {
      const result = service.verifyWebhook(
        'subscribe',
        'test-token',
        'challenge123',
      );
      expect(result).toBe('challenge123');
    });

    it('should throw ForbiddenException when token is invalid', () => {
      expect(() =>
        service.verifyWebhook('subscribe', 'wrong-token', 'challenge123'),
      ).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when mode is not subscribe', () => {
      expect(() =>
        service.verifyWebhook('unsubscribe', 'test-token', 'challenge123'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('handleIncoming', () => {
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
                ...overrides.value,
              },
              ...overrides.change,
            },
          ],
          ...overrides.entry,
        },
      ],
      ...overrides.root,
    });

    const mockClientAgent = {
      _id: 'ca-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      status: 'active',
      channels: [
        {
          channelId: 'whatsapp-1',
          status: 'active',
          provider: 'meta',
          credentials: { phoneNumberId: 'phone123', accessToken: 'sk-wa-token' },
          llmConfig: {
            provider: LlmProvider.OpenAI,
            apiKey: 'sk-mock-key',
            model: 'gpt-4',
          },
        },
      ],
    };

    const mockAgent = {
      id: 'agent-1',
      name: 'Support Bot',
      systemPrompt: 'You are a helpful assistant.',
    };

    it('should return early when payload has no messages', async () => {
      await service.handleIncoming({});
      expect(
        clientAgentRepository.findOneByPhoneNumberId,
      ).not.toHaveBeenCalled();
    });

    it('should return early when payload has no entry', async () => {
      await service.handleIncoming({ entry: [] });
      expect(
        clientAgentRepository.findOneByPhoneNumberId,
      ).not.toHaveBeenCalled();
    });

    it('should return early when message type is not text', async () => {
      const payload = createPayload({ message: { type: 'image' } });
      await service.handleIncoming(payload);
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should log warning when no ClientAgent found for phoneNumberId', async () => {
      clientAgentRepository.findOneByPhoneNumberId.mockResolvedValue(null);

      const payload = createPayload({
        metadata: { phone_number_id: 'unknown-phone' },
      });
      await service.handleIncoming(payload);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[WhatsApp] No active ClientAgent found for phoneNumberId=unknown-phone.',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should log warning when channel config mismatch in ClientAgent', async () => {
      const mismatchClientAgent = {
        ...mockClientAgent,
        channels: [
          {
            ...mockClientAgent.channels[0],
            credentials: { phoneNumberId: 'other-phone', accessToken: 'sk-wa-token' },
          },
        ],
      };
      clientAgentRepository.findOneByPhoneNumberId.mockResolvedValue(
        mismatchClientAgent as any,
      );

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[WhatsApp] Channel config not found in ClientAgent for phoneNumberId=phone123 (mismatch).',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should call agentService.run with correct input and context', async () => {
      clientAgentRepository.findOneByPhoneNumberId.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Hello' },
      });

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(agentService.run).toHaveBeenCalledWith(
        {
          channel: 'whatsapp',
          externalUserId: '1234567890',
          conversationId: 'phone123:1234567890',
          message: { type: 'text', text: 'Hello' },
          metadata: { messageId: 'msg123', phoneNumberId: 'phone123' },
        },
        {
          agentId: 'agent-1',
          clientId: 'client-1',
          systemPrompt: 'You are a helpful assistant.',
          llmConfig: {
            ...mockClientAgent.channels[0].llmConfig,
            apiKey: 'sk-mock-key',
          },
          channelConfig: mockClientAgent.channels[0].credentials,
        },
      );
    });

    it('should log outbound message when reply exists', async () => {
      clientAgentRepository.findOneByPhoneNumberId.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Echo response' },
      });

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[WhatsApp] Sending to 1234567890: Echo response',
      );
    });

    it('should not log outbound message when reply is undefined', async () => {
      clientAgentRepository.findOneByPhoneNumberId.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[WhatsApp] Sending to'),
      );
    });

    it('should skip processing when agent is not active', async () => {
      clientAgentRepository.findOneByPhoneNumberId.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(null);

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(agentService.run).not.toHaveBeenCalled();
    });
  });
});
