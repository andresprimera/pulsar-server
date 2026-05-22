import { Test, TestingModule } from '@nestjs/testing';
import { AgentToolSetBuilderService } from './agent-tool-set-builder.service';
import { LeadBootstrapService } from '@agent/lead-qualifier/lead-bootstrap.service';

describe('AgentToolSetBuilderService', () => {
  let service: AgentToolSetBuilderService;

  const correlation = {
    clientId: 'c1',
    conversationId: 'conv1',
    agentId: 'a1',
    channelId: 'ch1',
    contactId: 'ct1',
    toolingProfileId: 'standard' as const,
    agentKind: 'customer_service' as const,
  };

  const leadBootstrapMock = {
    upsertStub: jest.fn(),
    applyUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentToolSetBuilderService,
        { provide: LeadBootstrapService, useValue: leadBootstrapMock },
      ],
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

  it('sales-catalog profile yields empty tool set', () => {
    const tools = service.buildToolSet('sales-catalog', {
      ...correlation,
      toolingProfileId: 'sales-catalog',
    });
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('lead-qualifier profile exposes record_lead_qualification', () => {
    const tools = service.buildToolSet('lead-qualifier', {
      ...correlation,
      toolingProfileId: 'lead-qualifier',
      agentKind: 'lead_qualifier',
    });
    expect(Object.keys(tools)).toEqual(['record_lead_qualification']);
  });
});
