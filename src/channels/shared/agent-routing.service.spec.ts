import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { MessageRepository } from '../../database/repositories/message.repository';
import { ContactRepository } from '../../database/repositories/contact.repository';
import { AgentRoutingService } from './agent-routing.service';

describe('AgentRoutingService', () => {
  let service: AgentRoutingService;
  let clientAgentRepository: jest.Mocked<ClientAgentRepository>;
  let contactRepository: jest.Mocked<ContactRepository>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let agentRepository: jest.Mocked<AgentRepository>;

  const clientId = new Types.ObjectId().toString();
  const channelId = new Types.ObjectId();

  const createClientAgent = (agentId: string, phoneNumberId = 'phone-1') => ({
    _id: new Types.ObjectId(),
    clientId,
    agentId,
    status: 'active',
    channels: [
      {
        channelId,
        provider: 'meta',
        status: 'active',
        phoneNumberId,
        credentials: {
          phoneNumberId,
          accessToken: 'token',
        },
        llmConfig: {
          provider: 'openai',
          apiKey: 'key',
          model: 'gpt-4o-mini',
        },
      },
    ],
  });

  beforeEach(async () => {
    // Disable semantic routing for deterministic tests
    delete process.env.ENABLE_SEMANTIC_ROUTING;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRoutingService,
        {
          provide: ClientAgentRepository,
          useValue: {
            findActiveByPhoneNumberId: jest.fn(),
            findActiveByTiktokUserId: jest.fn(),
            findActiveByInstagramAccountId: jest.fn(),
          },
        },
        {
          provide: ContactRepository,
          useValue: { findByExternalUserId: jest.fn() },
        },
        {
          provide: MessageRepository,
          useValue: { findLatestByContactAndAgents: jest.fn() },
        },
        {
          provide: AgentRepository,
          useValue: { findById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AgentRoutingService);
    clientAgentRepository = module.get(ClientAgentRepository);
    contactRepository = module.get(ContactRepository);
    messageRepository = module.get(MessageRepository);
    agentRepository = module.get(AgentRepository);
  });

  it('resolves directly when only one candidate exists', async () => {
    const candidate = createClientAgent(new Types.ObjectId().toString());

    clientAgentRepository.findActiveByPhoneNumberId.mockResolvedValue([
      candidate as any,
    ]);
    agentRepository.findById.mockResolvedValue({
      _id: candidate.agentId,
      name: 'Support Agent',
      status: 'active',
    } as any);

    const result = await service.resolveRoute({
      channelIdentifier: 'phone-1',
      externalUserId: 'user-1',
      incomingText: 'hello',
      channelType: 'whatsapp',
    });

    expect(result.kind).toBe('resolved');
  });

  it('uses explicit numeric selection when multiple candidates exist', async () => {
    const candidateA = createClientAgent(new Types.ObjectId().toString());
    const candidateB = createClientAgent(new Types.ObjectId().toString());

    clientAgentRepository.findActiveByPhoneNumberId.mockResolvedValue([
      candidateA as any,
      candidateB as any,
    ]);

    agentRepository.findById
      .mockResolvedValueOnce({
        _id: candidateA.agentId,
        name: 'Customer Service Agent',
        status: 'active',
      } as any)
      .mockResolvedValueOnce({
        _id: candidateB.agentId,
        name: 'Sales Agent',
        status: 'active',
      } as any);

    const result = await service.resolveRoute({
      channelIdentifier: 'phone-1',
      externalUserId: 'user-1',
      incomingText: '2',
      channelType: 'whatsapp',
    });

    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') {
      expect(result.candidate.agentName).toBe('Sales Agent');
    }
  });

  it('returns ambiguity prompt when no explicit or sticky route is available', async () => {
    const candidateA = createClientAgent(new Types.ObjectId().toString());
    const candidateB = createClientAgent(new Types.ObjectId().toString());

    clientAgentRepository.findActiveByPhoneNumberId.mockResolvedValue([
      candidateA as any,
      candidateB as any,
    ]);

    agentRepository.findById
      .mockResolvedValueOnce({
        _id: candidateA.agentId,
        name: 'Customer Service Agent',
        status: 'active',
      } as any)
      .mockResolvedValueOnce({
        _id: candidateB.agentId,
        name: 'Sales Agent',
        status: 'active',
      } as any);

    contactRepository.findByExternalUserId.mockResolvedValue(null);
    messageRepository.findLatestByContactAndAgents.mockResolvedValue(null);

    const result = await service.resolveRoute({
      channelIdentifier: 'phone-1',
      externalUserId: 'user-1',
      incomingText: 'hello there',
      channelType: 'whatsapp',
    });

    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.prompt).toContain('Please reply with the number or name of the agent');
    }
  });
});
