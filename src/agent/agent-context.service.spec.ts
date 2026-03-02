import { Test, TestingModule } from '@nestjs/testing';
import { AgentContextService } from './agent-context.service';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { AgentContext } from './contracts/agent-context';
import { LlmProvider } from './llm/provider.enum';
import { Logger } from '@nestjs/common';

describe('AgentContextService', () => {
  let service: AgentContextService;
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentContextService,
        {
          provide: ClientRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentContextService>(AgentContextService);
    clientRepository = module.get(ClientRepository);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enrich context with client name in system prompt', async () => {
    clientRepository.findById.mockResolvedValue({
      _id: 'client-1',
      name: 'Acme Corp',
      type: 'organization',
      status: 'active',
    } as any);

    const result = await service.enrichContext(baseContext);

    expect(result.clientName).toBe('Acme Corp');
    expect(result.systemPrompt).toBe(
      'You are a helpful assistant.\n\nYou are representing "Acme Corp". In your first message to a new user, introduce yourself by mentioning the company you represent and your role.',
    );
  });

  it('should include agent name in system prompt when provided', async () => {
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

    expect(result.systemPrompt).toBe(
      'You are a helpful assistant.\n\nYou are representing "Acme Corp". Your role is "Customer Service Agent". In your first message to a new user, introduce yourself by mentioning the company you represent and your role.',
    );
  });

  it('should return context unchanged when client is not found', async () => {
    clientRepository.findById.mockResolvedValue(null);

    const result = await service.enrichContext(baseContext);

    expect(result).toBe(baseContext);
    expect(result.clientName).toBeUndefined();
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Client client-1 not found'),
    );
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
    expect(result.llmConfig).toEqual(baseContext.llmConfig);
    expect(result.channelConfig).toEqual({ phoneNumberId: '123' });
  });
});
