import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
import { AgentService } from '@agent/agent.service';
import { LlmProvider } from '@domain/llm/provider.enum';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { AgentRoutingService } from '@domain/routing/agent-routing.service';
import { AgentContextService } from '@agent/agent-context.service';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { ConversationService } from '@domain/conversation/conversation.service';
import { EventIdempotencyService } from '@persistence/event-idempotency.service';

describe('IncomingMessageOrchestrator', () => {
  let service: IncomingMessageOrchestrator;
  let agentService: jest.Mocked<AgentService>;
  let agentRoutingService: jest.Mocked<AgentRoutingService>;
  let agentContextService: jest.Mocked<AgentContextService>;
  let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
  let conversationService: jest.Mocked<ConversationService>;
  let eventIdempotencyService: jest.Mocked<EventIdempotencyService>;
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
          provide: ContactIdentityResolver,
          useValue: {
            resolveContact: jest.fn(),
          },
        },
        {
          provide: AgentContextService,
          useValue: {
            buildContextFromRoute: jest.fn(),
            buildAmbiguousPrompt: jest
              .fn()
              .mockResolvedValue(
                'Hey there! Thanks for reaching out.\n\nWe have a few specialists ready to help you:\n1. Support Bot\n2. Sales Bot\n\nJust reply with a number or name to get started!',
              ),
            getClientBillingAnchor: jest.fn().mockResolvedValue(new Date()),
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
        {
          provide: EventIdempotencyService,
          useValue: {
            registerIfFirst: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: QuotaEnforcementService,
          useValue: {
            check: jest.fn().mockResolvedValue({ allowed: true }),
          },
        },
      ],
    }).compile();

    service = module.get<IncomingMessageOrchestrator>(
      IncomingMessageOrchestrator,
    );
    agentService = module.get(AgentService);
    agentRoutingService = module.get(AgentRoutingService);
    agentContextService = module.get(AgentContextService);
    contactIdentityResolver = module.get(ContactIdentityResolver);
    conversationService = module.get(ConversationService);
    eventIdempotencyService = module.get(EventIdempotencyService);

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerWarnSpy?.mockRestore();
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
      billingAnchor: new Date(),
      agentPricing: {
        amount: 100,
        currency: 'USD',
        monthlyTokenQuota: null,
      },
      channels: [
        {
          channelId: '507f1f77bcf86cd799439014',
          status: 'active',
          provider: 'meta',
          phoneNumberId: 'phone123',
          credentials: {
            phoneNumberId: 'phone123',
            accessToken: 'sk-wa-token',
          },
          monthlyMessageQuota: null,
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
      const mockContext = {
        agentId: 'agent-1',
        agentName: 'Support Bot',
        clientId: mockClientAgent.clientId,
        channelId: mockClientAgent.channels[0].channelId,
        systemPrompt: mockAgent.systemPrompt,
        toolingProfileId: 'standard' as const,
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'sk-mock',
          model: 'gpt-4',
        },
        channelConfig: {},
      };
      const mockClient = {
        _id: mockClientAgent.clientId,
        name: 'Test Client',
        type: 'organization',
        status: 'active',
      };
      agentContextService.buildContextFromRoute.mockResolvedValue({
        context: mockContext,
        client: mockClient as any,
      });
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
          provider: mockClientAgent.channels[0].provider,
          routeChannelIdentifier: 'phone123',
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

    it('returns empty object and skips agent when event is duplicate', async () => {
      eventIdempotencyService.registerIfFirst.mockResolvedValue(false);

      const output = await service.handle(createEvent());

      expect(output).toEqual({});
      expect(agentService.run).not.toHaveBeenCalled();
      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
      expect(conversationService.resolveOrCreate).not.toHaveBeenCalled();
      expect(conversationService.touch).not.toHaveBeenCalled();
    });

    it('touches conversation and rethrows when agent run fails', async () => {
      agentRoutingService.resolveRoute.mockResolvedValue(
        mockResolvedRoute as any,
      );
      const mockContext = {
        agentId: 'agent-1',
        agentName: 'Support Bot',
        clientId: mockClientAgent.clientId,
        channelId: mockClientAgent.channels[0].channelId,
        systemPrompt: mockAgent.systemPrompt,
        toolingProfileId: 'standard' as const,
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'sk-mock',
          model: 'gpt-4',
        },
        channelConfig: {},
      };
      const mockClient = {
        _id: mockClientAgent.clientId,
        name: 'Test Client',
        type: 'organization',
        status: 'active',
      };
      agentContextService.buildContextFromRoute.mockResolvedValue({
        context: mockContext,
        client: mockClient as any,
      });
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
