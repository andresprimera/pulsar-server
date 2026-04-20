import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';
import { AgentContext } from './contracts/agent-context';
import { LlmProvider } from '@domain/llm/provider.enum';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

  const baseContext: AgentContext = {
    agentId: 'agent-1',
    clientId: 'client-1',
    channelId: 'channel-1',
    systemPrompt: 'You are a helpful assistant.',
    toolingProfileId: 'standard',
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

  it('should include [Organization Context] when context has companyBrief', () => {
    const contextWithBrief: AgentContext = {
      ...baseContext,
      companyBrief: 'We sell sustainable packaging to retailers.',
    };

    const result = service.build(contextWithBrief, {}, undefined);

    expect(result).toContain('[Organization Context]');
    expect(result).toContain('We sell sustainable packaging to retailers.');
  });

  it('should not include [Organization Context] when companyBrief is empty or missing', () => {
    const result = service.build(baseContext, {}, undefined);
    expect(result).not.toContain('[Organization Context]');
  });

  it('should include [Task Context] when context has promptSupplement', () => {
    const contextWithTask: AgentContext = {
      ...baseContext,
      promptSupplement: 'Refund policy: 30 days.',
    };

    const result = service.build(contextWithTask, {}, undefined);

    expect(result).toContain('[Task Context]');
    expect(result).toContain('Refund policy: 30 days.');
  });

  it('should not include [Task Context] when promptSupplement is empty or missing', () => {
    const result = service.build(baseContext, {}, undefined);
    expect(result).not.toContain('[Task Context]');
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

  it('should include [Personality Examples] when context has examplePhrases', () => {
    const contextWithExamples: AgentContext = {
      ...baseContext,
      personality: {
        id: 'p-1',
        name: 'Friendly',
        promptTemplate: 'Be warm.',
        examplePhrases: [
          "I'd be happy to help with that!",
          'Thanks for reaching out.',
        ],
      },
    };

    const result = service.build(contextWithExamples, {}, undefined);

    expect(result).toContain('[Personality Examples]');
    expect(result).toContain('Examples of how you should speak:');
    expect(result).toContain("• I'd be happy to help with that!");
    expect(result).toContain('• Thanks for reaching out.');
  });

  it('should not include [Personality Examples] when examplePhrases is empty or missing', () => {
    const result = service.build(baseContext, {}, undefined);
    expect(result).not.toContain('[Personality Examples]');

    const contextEmptyPhrases: AgentContext = {
      ...baseContext,
      personality: {
        id: 'p-1',
        name: 'P',
        promptTemplate: 'Be brief.',
        examplePhrases: [],
      },
    };
    const result2 = service.build(contextEmptyPhrases, {}, undefined);
    expect(result2).not.toContain('[Personality Examples]');
  });

  it('should include [Personality Guardrails] when context has guardrails', () => {
    const contextWithGuardrails: AgentContext = {
      ...baseContext,
      personality: {
        id: 'p-1',
        name: 'Professional',
        promptTemplate: 'Be professional.',
        guardrails:
          'Stay professional. Do not use slang or make promises you cannot keep.',
      },
    };

    const result = service.build(contextWithGuardrails, {}, undefined);

    expect(result).toContain('[Personality Guardrails]');
    expect(result).toContain(
      'Stay professional. Do not use slang or make promises you cannot keep.',
    );
  });

  it('should not include [Personality Guardrails] when guardrails is empty or missing', () => {
    const result = service.build(baseContext, {}, undefined);
    expect(result).not.toContain('[Personality Guardrails]');

    const contextEmptyGuardrails: AgentContext = {
      ...baseContext,
      personality: {
        id: 'p-1',
        name: 'P',
        promptTemplate: 'Be brief.',
        guardrails: '   ',
      },
    };
    const result2 = service.build(contextEmptyGuardrails, {}, undefined);
    expect(result2).not.toContain('[Personality Guardrails]');
  });

  it('should order sections: Agent, Organization, Personality, Examples, Guardrails, Task, Client, Contact, Safety', () => {
    const context: AgentContext = {
      ...baseContext,
      clientName: 'Co',
      companyBrief: 'Org line.',
      promptSupplement: 'Task line.',
      personality: {
        id: 'p-1',
        name: 'P',
        promptTemplate: 'Personality text',
        examplePhrases: ['Example one.'],
        guardrails: 'Do not be rude.',
      },
    };

    const result = service.build(context, { key: 'value' }, 'Summary');

    const agentIdx = result.indexOf('[Agent Instructions]');
    const orgIdx = result.indexOf('[Organization Context]');
    const personalityIdx = result.indexOf('[Personality]');
    const examplesIdx = result.indexOf('[Personality Examples]');
    const guardrailsIdx = result.indexOf('[Personality Guardrails]');
    const taskIdx = result.indexOf('[Task Context]');
    const clientIdx = result.indexOf('[Client Context]');
    const contactIdx = result.indexOf('[Contact Context]');
    const safetyIdx = result.indexOf('[Safety Rules]');

    expect(agentIdx).toBeLessThan(orgIdx);
    expect(orgIdx).toBeLessThan(personalityIdx);
    expect(personalityIdx).toBeLessThan(examplesIdx);
    expect(examplesIdx).toBeLessThan(guardrailsIdx);
    expect(guardrailsIdx).toBeLessThan(taskIdx);
    expect(taskIdx).toBeLessThan(clientIdx);
    expect(clientIdx).toBeLessThan(contactIdx);
    expect(contactIdx).toBeLessThan(safetyIdx);
  });

  it('should place Organization Context before Personality when both exist', () => {
    const context: AgentContext = {
      ...baseContext,
      companyBrief: 'About the company.',
      personality: {
        id: 'p-1',
        name: 'P',
        promptTemplate: 'Personality.',
        examplePhrases: ['Say this.'],
      },
    };

    const result = service.build(context, {}, undefined);

    const orgIdx = result.indexOf('[Organization Context]');
    const personalityIdx = result.indexOf('[Personality]');
    expect(orgIdx).toBeLessThan(personalityIdx);
  });

  it('should place Task Context after Personality Guardrails when both exist', () => {
    const context: AgentContext = {
      ...baseContext,
      promptSupplement: 'Per-hire notes.',
      personality: {
        id: 'p-1',
        name: 'P',
        promptTemplate: 'Be brief.',
        guardrails: 'Stay safe.',
      },
    };

    const result = service.build(context, {}, undefined);

    const guardrailsIdx = result.indexOf('[Personality Guardrails]');
    const taskIdx = result.indexOf('[Task Context]');
    expect(guardrailsIdx).toBeLessThan(taskIdx);
  });
});
