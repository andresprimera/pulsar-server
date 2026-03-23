import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { AgentsService } from '@agents/agents.service';
import { ClientsService } from '@clients/clients.service';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';

describe('ClientAgentsService', () => {
  let service: ClientAgentsService;
  let mockClientAgentRepository: any;
  let mockClientsService: any;
  let mockAgentsService: any;
  let mockChannelRepository: any;
  let mockClientPhoneRepository: any;
  let mockAgentPriceRepository: any;
  let mockChannelPriceRepository: any;
  let mockPersonalityRepository: any;

  const mockClientAgent = {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    personalityId: 'personality-1',
    status: 'active',
    agentPricing: { amount: 100, currency: 'USD', monthlyTokenQuota: null },
    billingAnchor: new Date(),
  };

  const mockPersonality = {
    _id: 'personality-1',
    name: 'Default',
    promptTemplate: 'Be helpful.',
    status: 'active',
  };

  const mockClient = {
    id: 'client-1',
    status: 'active',
    billingCurrency: 'USD',
  };

  const mockAgent = {
    id: 'agent-1',
    status: 'active',
    monthlyTokenQuota: null,
  };

  beforeEach(async () => {
    mockClientAgentRepository = {
      create: jest.fn(),
      findByClient: jest.fn(),
      findByClientAndAgent: jest.fn(),
      findByClientAndStatus: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      updateWithQuery: jest.fn(),
    };

    mockClientsService = {
      findById: jest.fn(),
    };

    mockAgentsService = {
      findOne: jest.fn(),
    };

    mockChannelRepository = {
      findByIdOrFail: jest.fn(),
    };

    mockClientPhoneRepository = {
      resolveOrCreate: jest.fn(),
    };

    mockAgentPriceRepository = {
      findActiveByAgentAndCurrency: jest
        .fn()
        .mockResolvedValue({ amount: 100 }),
    };

    mockChannelPriceRepository = {
      findActiveByChannelAndCurrency: jest
        .fn()
        .mockResolvedValue({ amount: 0 }),
    };

    mockPersonalityRepository = {
      findActiveById: jest.fn().mockResolvedValue(mockPersonality),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAgentsService,
        {
          provide: ClientAgentRepository,
          useValue: mockClientAgentRepository,
        },
        {
          provide: ClientsService,
          useValue: mockClientsService,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: ChannelRepository,
          useValue: mockChannelRepository,
        },
        {
          provide: ClientPhoneRepository,
          useValue: mockClientPhoneRepository,
        },
        {
          provide: AgentPriceRepository,
          useValue: mockAgentPriceRepository,
        },
        {
          provide: ChannelPriceRepository,
          useValue: mockChannelPriceRepository,
        },
        {
          provide: PersonalityRepository,
          useValue: mockPersonalityRepository,
        },
      ],
    }).compile();

    service = module.get<ClientAgentsService>(ClientAgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const baseDto: any = {
      clientId: '507f1f77bcf86cd799439011',
      agentId: '507f1f77bcf86cd799439012',
      personalityId: '507f1f77bcf86cd799439099',
      channels: [
        {
          channelId: '507f1f77bcf86cd799439013',
          provider: 'instagram',
          credentials: { instagramAccountId: '17841400000000009' },
          llmConfig: {
            provider: 'openai',
            apiKey: 'test-key',
            model: 'gpt-4o',
          },
        },
      ],
    };

    it('should create client agent if client and agent are active', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockAgentPriceRepository.findActiveByAgentAndCurrency.mockResolvedValue({
        amount: 100,
      });
      mockChannelPriceRepository.findActiveByChannelAndCurrency.mockResolvedValue(
        { amount: 0 },
      );
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
        monthlyMessageQuota: null,
      });
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const result = await service.create(baseDto as any);

      expect(mockClientsService.findById).toHaveBeenCalledWith(
        baseDto.clientId,
      );
      expect(mockAgentsService.findOne).toHaveBeenCalledWith(baseDto.agentId);
      expect(
        mockClientAgentRepository.findByClientAndAgent,
      ).toHaveBeenCalledWith(baseDto.clientId, baseDto.agentId);
      expect(mockPersonalityRepository.findActiveById).toHaveBeenCalledWith(
        baseDto.personalityId,
      );
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: baseDto.clientId,
          agentId: baseDto.agentId,
          personalityId: expect.anything(),
          agentPricing: expect.objectContaining({
            amount: 100,
            currency: 'USD',
          }),
          billingAnchor: expect.any(Date),
          status: 'active',
          channels: expect.arrayContaining([
            expect.objectContaining({
              instagramAccountId: '17841400000000009',
              provider: 'instagram',
              amount: 0,
              currency: 'USD',
            }),
          ]),
        }),
      );
      expect(result).toEqual(mockClientAgent);
    });

    it('should throw BadRequestException when no channels are provided', async () => {
      await expect(
        service.create({ ...baseDto, channels: [] } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ ...baseDto, channels: [] } as any),
      ).rejects.toThrow('At least one channel is required');
    });

    it('should throw BadRequestException if client is not found', async () => {
      mockClientsService.findById.mockResolvedValue(null);

      const dto = { ...baseDto, clientId: 'unknown' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Client not found or not active',
      );
    });

    it('should throw BadRequestException if client is archived', async () => {
      mockClientsService.findById.mockResolvedValue({
        ...mockClient,
        status: 'archived',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if client is inactive', async () => {
      mockClientsService.findById.mockResolvedValue({
        ...mockClient,
        status: 'inactive',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is not found', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(null);

      const dto = { ...baseDto, agentId: 'unknown' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Agent not found or not active',
      );
    });

    it('should throw BadRequestException if agent is archived', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue({
        ...mockAgent,
        status: 'archived',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is inactive', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue({
        ...mockAgent,
        status: 'inactive',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if personality not found or inactive', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockPersonalityRepository.findActiveById.mockResolvedValue(null);

      await expect(service.create(baseDto as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(baseDto as any)).rejects.toThrow(
        'Personality not found or not active',
      );
    });

    it('should throw ConflictException if agent already hired by client', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(
        mockClientAgent,
      );

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for duplicate channel IDs', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });

      const dto = {
        ...baseDto,
        channels: [{ ...baseDto.channels[0] }, { ...baseDto.channels[0] }],
      };

      const createPromise = service.create(dto as any);
      await expect(createPromise).rejects.toThrow(BadRequestException);
      await expect(createPromise).rejects.toThrow(
        'Duplicate channelId in request',
      );
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['meta'],
      });

      await expect(service.create(baseDto as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(baseDto as any)).rejects.toThrow(
        'Provider "instagram" is not supported by channel "Instagram"',
      );
    });

    it('should enforce phone ownership for phoneNumberId channels', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'WhatsApp',
        supportedProviders: ['meta'],
      });

      const conflict = new ConflictException(
        'Phone number phone-1 is already owned by another client',
      );
      mockClientPhoneRepository.resolveOrCreate.mockRejectedValue(conflict);

      const dto = {
        ...baseDto,
        channels: [
          {
            ...baseDto.channels[0],
            provider: 'meta',
            credentials: { phoneNumberId: 'phone-1' },
          },
        ],
      };

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
        baseDto.clientId,
        'phone-1',
        { provider: 'meta' },
      );
    });

    it('should allow re-hiring archived agent relationship', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const dto = { ...baseDto };
      const result = await service.create(dto);

      expect(result).toEqual(mockClientAgent);
    });
  });

  describe('findByClient', () => {
    it('should return client agents', async () => {
      mockClientAgentRepository.findByClient.mockResolvedValue([
        mockClientAgent,
      ]);

      const result = await service.findByClient('client-1');
      expect(mockClientAgentRepository.findByClient).toHaveBeenCalledWith(
        'client-1',
      );
      expect(result).toEqual([mockClientAgent]);
    });
  });

  describe('update', () => {
    it('should return client agent unchanged when no updates provided', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);

      const result = await service.update('ca-1', {} as any);
      expect(mockClientAgentRepository.updateWithQuery).not.toHaveBeenCalled();
      expect(result).toEqual(mockClientAgent);
    });

    it('should update client agent when personalityId is provided', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockPersonalityRepository.findActiveById.mockResolvedValue(
        mockPersonality,
      );
      mockClientAgentRepository.updateWithQuery.mockResolvedValue({
        ...mockClientAgent,
        personalityId: 'personality-1',
      });

      const result = await service.update('ca-1', {
        personalityId: '507f1f77bcf86cd799439099',
      } as any);
      expect(mockPersonalityRepository.findActiveById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
      );
      expect(mockClientAgentRepository.updateWithQuery).toHaveBeenCalledWith(
        'ca-1',
        expect.objectContaining({ $set: expect.any(Object) }),
      );
      expect(result).toEqual({
        ...mockClientAgent,
        personalityId: 'personality-1',
      });
    });

    it('should throw NotFoundException if not found', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(null);
      await expect(service.update('unknown', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      await expect(service.update('ca-1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status to inactive', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({
        ...mockClientAgent,
        status: 'inactive',
      });

      const result = await service.updateStatus('ca-1', { status: 'inactive' });

      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', {
        status: 'inactive',
      });
      expect(result.status).toBe('inactive');
    });

    it('should archive without cascading (channels are embedded)', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });

      const result = await service.updateStatus('ca-1', { status: 'archived' });

      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', {
        status: 'archived',
      });
      expect(result.status).toBe('archived');
    });

    it('should throw BadRequestException if already archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      await expect(
        service.updateStatus('ca-1', { status: 'active' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateClientTotal', () => {
    it('should sum prices of active agents and return total with currency', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([
        {
          agentPricing: { amount: 100, currency: 'USD' },
          channels: [{ status: 'active', amount: 10 }],
        },
        {
          agentPricing: { amount: 200, currency: 'USD' },
          channels: [{ status: 'active', amount: 0 }],
        },
      ]);

      const result = await service.calculateClientTotal('client-1');
      expect(mockClientsService.findById).toHaveBeenCalledWith('client-1');
      expect(
        mockClientAgentRepository.findByClientAndStatus,
      ).toHaveBeenCalledWith('client-1', 'active');
      expect(result).toEqual({ total: 310, currency: 'USD' });
    });

    it('should return 0 and client currency if no active agents', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([]);
      const result = await service.calculateClientTotal('client-1');
      expect(result).toEqual({ total: 0, currency: 'USD' });
    });
  });
});
