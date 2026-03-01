import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
import { AgentService } from '@agent/agent.service';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { LlmProvider } from '@domain/llm/provider.enum';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { AgentRoutingService } from '@domain/routing/agent-routing.service';
import { AgentContextService } from '@agent/agent-context.service';
import { ContactIdentityResolver } from '@channels/shared/contact-identity.resolver';
import { ConversationService } from '@domain/conversation/conversation.service';

describe('IncomingMessageOrchestrator', () => {
  let service: IncomingMessageOrchestrator;
  let agentService: jest.Mocked<AgentService>;
  let agentRoutingService: jest.Mocked<AgentRoutingService>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
  let conversationService: jest.Mocked<ConversationService>;
  let loggerWarnSpy: jest.SpyInstance;

  const createEvent = (overrides: any = {}) => ({
    channelId: CHANNEL_TYPES.WHATSAPP,
    routeChannelIdentifier: 'phone123',
    channelIdentifier: '1234567890',
    messageId: 'msg123',
    text: 'Hello',
    rawPayload: {
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: 'phone123' } } }] },
      ],
    },
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomingMessageOrchestrator,
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
          provide: ClientRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({ name: 'Test Client' }),
          },
        },
        {
          provide: ContactIdentityResolver,
          useValue: {
            resolveContact: jest.fn(),
          },
        },
        {
          provide: AgentContextService,
          useValue: {
            enrichContext: jest
              .fn()
              .mockImplementation((ctx) => Promise.resolve(ctx)),
          },
        },
        {
          provide: ConversationService,
          useValue: {
            resolveOrCreate: jest.fn(),
            touch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IncomingMessageOrchestrator>(
      IncomingMessageOrchestrator,
    );
    agentService = module.get(AgentService);
    agentRoutingService = module.get(AgentRoutingService);
    agentRepository = module.get(AgentRepository);
    contactIdentityResolver = module.get(ContactIdentityResolver);
    conversationService = module.get(ConversationService);

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handle', () => {
    const mockClientAgent = {
      _id: 'ca-1',
      clientId: '507f1f77bcf86cd799439011',
      agentId: 'agent-1',
      status: 'active',
      channels: [
        {
          channelId: '507f1f77bcf86cd799439014',
          status: 'active',
          provider: 'meta',
          credentials: {
            phoneNumberId: 'phone123',
            accessToken: 'sk-wa-token',
          },
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

    const mockContact = {
      _id: '507f1f77bcf86cd799439012',
    };
    const mockConversation = {
      _id: '507f1f77bcf86cd799439099',
    };

    const mockResolvedRoute = {
      kind: 'resolved' as const,
      candidate: {
        clientAgent: mockClientAgent,
        channelConfig: mockClientAgent.channels[0],
        agentName: 'Support Bot',
      },
    };

    it('returns undefined when route is unroutable', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue({
        kind: 'unroutable',
        reason: 'no-candidates',
      });

      const output = await service.handle(
        createEvent({ routeChannelIdentifier: 'unknown-phone' }),
      );

      expect(output).toBeUndefined();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[WhatsApp] No active ClientAgent found for routeChannelIdentifier=unknown-phone.',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('returns clarification reply when route is ambiguous', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue({
        kind: 'ambiguous',
        candidates: [
          {
            clientAgent: mockClientAgent as any,
            channelConfig: mockClientAgent.channels[0] as any,
            agentName: 'Support Bot',
          },
          {
            clientAgent: mockClientAgent as any,
            channelConfig: mockClientAgent.channels[0] as any,
            agentName: 'Sales Bot',
          },
        ],
        prompt: 'choose',
      });

      const output = await service.handle(createEvent());

      expect(output?.reply?.text).toContain(
        'We have a few specialists ready to help you:',
      );
      expect(agentService.run).not.toHaveBeenCalled();
      expect(conversationService.touch).not.toHaveBeenCalled();
    });

    it('returns agent output and touches conversation once', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue(
        mockResolvedRoute as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      contactIdentityResolver.resolveContact.mockResolvedValue(
        mockContact as any,
      );
      conversationService.resolveOrCreate.mockResolvedValue(
        mockConversation as any,
      );
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Hello' },
      });

      const output = await service.handle(createEvent());

      expect(output).toEqual({
        reply: { type: 'text', text: 'Hello' },
        channelMeta: {
          encryptedCredentials: mockClientAgent.channels[0].credentials,
        },
      });
      expect(agentService.run).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'whatsapp',
          contactId: '507f1f77bcf86cd799439012',
          conversationId: '507f1f77bcf86cd799439099',
          metadata: { messageId: 'msg123', routeChannelIdentifier: 'phone123' },
        }),
        expect.anything(),
      );
      expect(conversationService.touch).toHaveBeenCalledTimes(1);
    });

    it('touches conversation and rethrows when agent run fails', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue(
        mockResolvedRoute as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      contactIdentityResolver.resolveContact.mockResolvedValue(
        mockContact as any,
      );
      conversationService.resolveOrCreate.mockResolvedValue(
        mockConversation as any,
      );
      agentService.run.mockRejectedValue(new Error('run failed'));

      await expect(service.handle(createEvent())).rejects.toThrow('run failed');
      expect(conversationService.touch).toHaveBeenCalledTimes(1);
    });
  });
});
