import { Test, TestingModule } from '@nestjs/testing';
import { AgentContextService } from './agent-context.service';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { AgentContext } from './contracts/agent-context';
import { LlmProvider } from '@domain/llm/provider.enum';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';

jest.mock('@shared/crypto.util', () => ({
  decrypt: jest.fn((x: string) => x),
  decryptRecord: jest.fn((x: unknown) => x ?? {}),
}));

describe('AgentContextService', () => {
  let service: AgentContextService;
  let moduleRef: TestingModule;
  let clientRepository: jest.Mocked<ClientRepository>;
  let warnSpy: jest.SpyInstance;

  const baseContext: AgentContext = {
    agentId: 'agent-1',
    clientId: 'client-1',
    channelId: 'channel-1',
    systemPrompt: 'You are a helpful assistant.',
    llmConfig: {
      provider: LlmProvider.OpenAI,
      apiKey: 'sk-mock',
      model: 'gpt-4o',
    },
  };

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      providers: [
        AgentContextService,
        {
          provide: AgentRepository,
          useValue: {
            findActiveById: jest.fn(),
          },
        },
        {
          provide: ClientRepository,
          useValue: {
            findById: jest.fn(),
            findByIdWithLlmCredentials: jest.fn(),
          },
        },
        {
          provide: PersonalityRepository,
          useValue: {
            findActiveById: jest.fn(),
          },
        },
      ],
    }).compile();

    moduleRef = testingModule;
    service = testingModule.get<AgentContextService>(AgentContextService);
    clientRepository = testingModule.get(ClientRepository);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enrich context with client name (PromptBuilder builds prompt; systemPrompt unchanged)', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Acme Corp',
      type: 'organization',
      status: 'active',
    } as any);

    const result = await service.enrichContext(baseContext);

    expect(result.clientName).toBe('Acme Corp');
    expect(result.systemPrompt).toBe(baseContext.systemPrompt);
  });

  it('should include agent name on context when provided (systemPrompt unchanged)', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Acme Corp',
      type: 'organization',
      status: 'active',
    } as any);

    const contextWithAgent: AgentContext = {
      ...baseContext,
      agentName: 'Customer Service Agent',
    };

    const result = await service.enrichContext(contextWithAgent);

    expect(result.clientName).toBe('Acme Corp');
    expect(result.agentName).toBe('Customer Service Agent');
    expect(result.systemPrompt).toBe(contextWithAgent.systemPrompt);
  });

  it('should enrich context with client companyBrief when set', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Acme Corp',
      type: 'organization',
      status: 'active',
      companyBrief: 'We build widgets for enterprise teams.',
    } as any);

    const result = await service.enrichContext(baseContext);

    expect(result.clientName).toBe('Acme Corp');
    expect(result.companyBrief).toBe('We build widgets for enterprise teams.');
  });

  it('should not add companyBrief to context when client has none or whitespace', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Acme Corp',
      type: 'organization',
      status: 'active',
      companyBrief: '   ',
    } as any);

    const result = await service.enrichContext(baseContext);

    expect(result.clientName).toBe('Acme Corp');
    expect(result.companyBrief).toBeUndefined();
  });

  it('should return context unchanged when client is not found', async () => {
    clientRepository.findById.mockResolvedValue(null);

    const result = await service.enrichContext(baseContext);

    expect(result).toEqual(baseContext);
    expect(result.clientName).toBeUndefined();
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Client client-1 not found'),
    );
  });

  it('should not retain stale companyBrief from input when client document has none', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Acme Corp',
      type: 'organization',
      status: 'active',
    } as any);

    const contextWithStale: AgentContext = {
      ...baseContext,
      companyBrief: 'Stale text that must be dropped.',
    };

    const result = await service.enrichContext(contextWithStale);

    expect(result.clientName).toBe('Acme Corp');
    expect(result.companyBrief).toBeUndefined();
  });

  it('should use passed-in client and not call findById when client is provided', async () => {
    const passedClient = {
      _id: 'client-1',
      name: 'Passed Client',
      type: 'organization',
      status: 'active',
      companyBrief: 'Org facts from preload.',
    } as any;

    const result = await service.enrichContext(baseContext, passedClient);

    expect(result.clientName).toBe('Passed Client');
    expect(result.companyBrief).toBe('Org facts from preload.');
    expect(clientRepository.findById).not.toHaveBeenCalled();
  });

  it('should preserve all other context fields', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Test LLC',
      type: 'organization',
      status: 'active',
    } as any);

    const contextWithConfig: AgentContext = {
      ...baseContext,
      channelConfig: { phoneNumberId: '123' },
    };

    const result = await service.enrichContext(contextWithConfig);

    expect(result.agentId).toBe('agent-1');
    expect(result.clientId).toBe('client-1');
    expect(result.channelId).toBe('channel-1');
    expect(result.systemPrompt).toBe(baseContext.systemPrompt);
    expect(result.llmConfig).toEqual(baseContext.llmConfig);
    expect(result.channelConfig).toEqual({ phoneNumberId: '123' });
  });

  describe('buildContextFromRoute', () => {
    const mockClientAgent = {
      clientId: 'client-1',
      agentId: 'agent-1',
      personalityId: new Types.ObjectId(),
      agentPricing: { amount: 100, currency: 'USD', monthlyTokenQuota: null },
      billingAnchor: new Date(),
      status: 'active',
      channels: [],
    } as any;
    const mockChannelConfig = {
      channelId: new Types.ObjectId(),
      provider: 'meta',
      status: 'active' as const,
      credentials: {},
      amount: 0,
      currency: 'USD',
      monthlyMessageQuota: null,
    } as any;
    const mockAgent = {
      _id: 'agent-1',
      name: 'Support Agent',
      systemPrompt: 'You are helpful.',
    } as any;
    const mockPersonality = {
      _id: new Types.ObjectId(),
      name: 'Friendly',
      promptTemplate: 'Be friendly.',
      examplePhrases: [],
      guardrails: '',
    } as any;

    beforeEach(() => {
      const agentRepo = moduleRef.get(
        AgentRepository,
      ) as jest.Mocked<AgentRepository>;
      const personalityRepo = moduleRef.get(
        PersonalityRepository,
      ) as jest.Mocked<PersonalityRepository>;
      agentRepo.findActiveById = jest.fn().mockResolvedValue(mockAgent);
      personalityRepo.findActiveById = jest
        .fn()
        .mockResolvedValue(mockPersonality);
    });

    it('should use client llmConfig when present and apiKey is valid', async () => {
      const clientWithLlm = {
        _id: 'client-1',
        name: 'Acme',
        type: 'organization',
        status: 'active',
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'encrypted-client-key',
          model: 'gpt-4o-mini',
        },
      } as any;
      clientRepository.findByIdWithLlmCredentials.mockResolvedValue(
        clientWithLlm,
      );

      const { context, client } = await service.buildContextFromRoute(
        mockClientAgent,
        mockChannelConfig,
      );

      expect(context).not.toBeNull();
      expect(context!.llmConfig.provider).toBe(LlmProvider.OpenAI);
      expect(context!.llmConfig.model).toBe('gpt-4o-mini');
      expect(context!.llmConfig.apiKey).toBe('encrypted-client-key');
      expect(client).toBe(clientWithLlm);
    });

    it('should use env fallback when client has no llmConfig', async () => {
      const clientNoLlm = {
        _id: 'client-1',
        name: 'Acme',
        type: 'organization',
        status: 'active',
      } as any;
      clientRepository.findByIdWithLlmCredentials.mockResolvedValue(
        clientNoLlm,
      );
      const envKey = 'env-openai-key';
      const orig = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = envKey;

      try {
        const { context } = await service.buildContextFromRoute(
          mockClientAgent,
          mockChannelConfig,
        );
        expect(context).not.toBeNull();
        expect(context!.llmConfig.apiKey).toBe(envKey);
        expect(context!.llmConfig.provider).toBe(LlmProvider.OpenAI);
        expect(context!.llmConfig.model).toBe('gpt-4o');
      } finally {
        process.env.OPENAI_API_KEY = orig;
      }
    });

    it('should use env fallback when client llmConfig.apiKey is REPLACE_ME', async () => {
      const clientReplaceMe = {
        _id: 'client-1',
        name: 'Acme',
        type: 'organization',
        status: 'active',
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'REPLACE_ME',
          model: 'gpt-4o',
        },
      } as any;
      clientRepository.findByIdWithLlmCredentials.mockResolvedValue(
        clientReplaceMe,
      );
      const envKey = 'fallback-env-key';
      const orig = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = envKey;

      try {
        const { context } = await service.buildContextFromRoute(
          mockClientAgent,
          mockChannelConfig,
        );
        expect(context).not.toBeNull();
        expect(context!.llmConfig.apiKey).toBe(envKey);
        expect(context!.llmConfig.provider).toBe(LlmProvider.OpenAI);
        expect(context!.llmConfig.model).toBe('gpt-4o');
      } finally {
        process.env.OPENAI_API_KEY = orig;
      }
    });

    it('should set promptSupplement on context from clientAgent when trim-non-empty', async () => {
      const clientWithLlm = {
        _id: 'client-1',
        name: 'Acme',
        type: 'organization',
        status: 'active',
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'encrypted-client-key',
          model: 'gpt-4o-mini',
        },
      } as any;
      clientRepository.findByIdWithLlmCredentials.mockResolvedValue(
        clientWithLlm,
      );

      const agentWithSupplement = {
        ...mockClientAgent,
        promptSupplement: '  Hire-specific FAQ line.  ',
      };

      const { context } = await service.buildContextFromRoute(
        agentWithSupplement,
        mockChannelConfig,
      );

      expect(context).not.toBeNull();
      expect(context!.promptSupplement).toBe('Hire-specific FAQ line.');
    });

    it('should omit promptSupplement when clientAgent has none or whitespace', async () => {
      const clientWithLlm = {
        _id: 'client-1',
        name: 'Acme',
        type: 'organization',
        status: 'active',
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'k',
          model: 'gpt-4o-mini',
        },
      } as any;
      clientRepository.findByIdWithLlmCredentials.mockResolvedValue(
        clientWithLlm,
      );

      const { context } = await service.buildContextFromRoute(
        { ...mockClientAgent, promptSupplement: '  \n  ' },
        mockChannelConfig,
      );

      expect(context).not.toBeNull();
      expect(context!.promptSupplement).toBeUndefined();
    });

    it('should never use channelConfig.llmConfig (resolution from client or env only)', async () => {
      const clientWithLlm = {
        _id: 'client-1',
        name: 'Acme',
        type: 'organization',
        status: 'active',
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'encrypted-client-key',
          model: 'gpt-4o-mini',
        },
      } as any;
      clientRepository.findByIdWithLlmCredentials.mockResolvedValue(
        clientWithLlm,
      );
      const channelConfigWithFakeLlm = {
        ...mockChannelConfig,
        llmConfig: {
          provider: LlmProvider.OpenAI,
          apiKey: 'channel-api-key-should-be-ignored',
          model: 'channel-model-should-be-ignored',
        },
      } as any;

      const { context } = await service.buildContextFromRoute(
        mockClientAgent,
        channelConfigWithFakeLlm,
      );

      expect(context).not.toBeNull();
      const ctx = context as NonNullable<typeof context>;
      expect(ctx.llmConfig.apiKey).toBe('encrypted-client-key');
      expect(ctx.llmConfig.model).toBe('gpt-4o-mini');
      expect(ctx.llmConfig.apiKey).not.toBe(
        'channel-api-key-should-be-ignored',
      );
      expect(ctx.llmConfig.model).not.toBe('channel-model-should-be-ignored');
    });
  });
});
