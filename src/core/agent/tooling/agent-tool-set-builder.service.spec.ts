import { Test, TestingModule } from '@nestjs/testing';
import { AgentToolSetBuilderService } from './agent-tool-set-builder.service';

describe('AgentToolSetBuilderService', () => {
  let service: AgentToolSetBuilderService;

  const correlation = {
    clientId: 'c1',
    conversationId: 'conv1',
    agentId: 'a1',
    channelId: 'ch1',
    contactId: 'ct1',
    toolingProfileId: 'standard' as const,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentToolSetBuilderService],
    }).compile();
    service = module.get(AgentToolSetBuilderService);
  });

  it('standard profile yields empty tool set', () => {
    const tools = service.buildToolSet('standard', correlation);
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('internal-debug profile exposes agent_debug_log', () => {
    const tools = service.buildToolSet('internal-debug', {
      ...correlation,
      toolingProfileId: 'internal-debug',
    });
    expect(Object.keys(tools)).toEqual(['agent_debug_log']);
  });
});
