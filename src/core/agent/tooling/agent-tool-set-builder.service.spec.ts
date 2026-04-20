import { Test, TestingModule } from '@nestjs/testing';
import { AgentToolSetBuilderService } from './agent-tool-set-builder.service';
import { ClientCatalogItemRepository } from '@persistence/repositories/client-catalog-item.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';

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
      providers: [
        AgentToolSetBuilderService,
        {
          provide: ClientCatalogItemRepository,
          useValue: {
            findByClientPaged: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
          },
        },
        {
          provide: ClientRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              status: 'active',
              billingCurrency: 'USD',
            }),
          },
        },
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

  it('sales-catalog profile exposes list_client_catalog', () => {
    const tools = service.buildToolSet('sales-catalog', {
      ...correlation,
      toolingProfileId: 'sales-catalog',
    });
    expect(Object.keys(tools)).toEqual(['list_client_catalog']);
  });
});
