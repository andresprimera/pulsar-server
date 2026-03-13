import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';
import { AgentContext } from './contracts/agent-context';
import { LlmProvider } from './llm/provider.enum';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

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
      providers: [PromptBuilderService],
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should include [Agent Instructions] and [Safety Rules] sections', () => {
    const result = service.build(baseContext, {}, undefined);

    expect(result).toContain('[Agent Instructions]');
    expect(result).toContain(baseContext.systemPrompt);
    expect(result).toContain('[Safety Rules]');
    expect(result).toContain(
      'Do not imply prior-conversation memory or continuity',
    );
  });

  it('should include [Personality] when context has personality', () => {
    const contextWithPersonality: AgentContext = {
      ...baseContext,
      personality: {
        id: 'p-1',
        name: 'Friendly',
        promptTemplate: 'Always be warm and use casual language.',
      },
    };

    const result = service.build(contextWithPersonality, {}, undefined);

    expect(result).toContain('[Personality]');
    expect(result).toContain('Always be warm and use casual language.');
  });

  it('should include [Client Context] when clientName and agentName are set', () => {
    const contextWithClient: AgentContext = {
      ...baseContext,
      clientName: 'Acme Corp',
      agentName: 'Support Agent',
    };

    const result = service.build(contextWithClient, {}, undefined);

    expect(result).toContain('[Client Context]');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('Support Agent');
  });

  it('should include [Contact Context] with summary and safe metadata', () => {
    const result = service.build(
      baseContext,
      { firstName: 'Jane', language: 'en' },
      'Previously asked about pricing.',
    );

    expect(result).toContain('[Contact Context]');
    expect(result).toContain('Previously asked about pricing.');
    expect(result).toContain('Jane');
    expect(result).toContain('first name');
  });

  it('should order sections: Agent Instructions, Personality, Client, Contact, Safety', () => {
    const context: AgentContext = {
      ...baseContext,
      clientName: 'Co',
      personality: {
        id: 'p-1',
        name: 'P',
        promptTemplate: 'Personality text',
      },
    };

    const result = service.build(context, { key: 'value' }, 'Summary');

    const agentIdx = result.indexOf('[Agent Instructions]');
    const personalityIdx = result.indexOf('[Personality]');
    const clientIdx = result.indexOf('[Client Context]');
    const contactIdx = result.indexOf('[Contact Context]');
    const safetyIdx = result.indexOf('[Safety Rules]');

    expect(agentIdx).toBeLessThan(personalityIdx);
    expect(personalityIdx).toBeLessThan(clientIdx);
    expect(clientIdx).toBeLessThan(contactIdx);
    expect(contactIdx).toBeLessThan(safetyIdx);
  });
});
