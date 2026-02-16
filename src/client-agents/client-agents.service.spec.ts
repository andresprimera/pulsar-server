import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { ClientsService } from '../clients/clients.service';
import { AgentsService } from '../agents/agents.service';
import { ChannelRepository } from '../database/repositories/channel.repository';
import { ClientPhoneRepository } from '../database/repositories/client-phone.repository';

describe('ClientAgentsService', () => {
  let service: ClientAgentsService;
  let mockClientAgentRepository: any;
  let mockClientsService: any;
  let mockAgentsService: any;
  let mockChannelRepository: any;
  let mockClientPhoneRepository: any;

  const mockClientAgent = {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    status: 'active',
    price: 100,
  };

  const mockClient = {
    id: 'client-1',
    status: 'active',
  };

  const mockAgent = {
    id: 'agent-1',
    status: 'active',
  };

  beforeEach(async () => {
    mockClientAgentRepository = {
      create: jest.fn(),
      findByClient: jest.fn(),
      findByClientAndAgent: jest.fn(),
      findByClientAndStatus: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
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
      price: 100,
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
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const result = await service.create(baseDto as any);

      expect(mockClientsService.findById).toHaveBeenCalledWith(baseDto.clientId);
      expect(mockAgentsService.findOne).toHaveBeenCalledWith(baseDto.agentId);
      expect(
        mockClientAgentRepository.findByClientAndAgent,
      ).toHaveBeenCalledWith(baseDto.clientId, baseDto.agentId);
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: baseDto.clientId,
          agentId: baseDto.agentId,
          price: baseDto.price,
          status: 'active',
          channels: expect.arrayContaining([
            expect.objectContaining({
              instagramAccountId: '17841400000000009',
              provider: 'instagram',
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
        channels: [
          { ...baseDto.channels[0] },
          { ...baseDto.channels[0] },
        ],
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

      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
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
    it('should update client agent', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({
        ...mockClientAgent,
        price: 200,
      });

      const result = await service.update('ca-1', { price: 200 });
      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', {
        price: 200,
      });
      expect(result.price).toBe(200);
    });

    it('should throw NotFoundException if not found', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(null);
      await expect(service.update('unknown', { price: 200 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      await expect(service.update('ca-1', { price: 200 })).rejects.toThrow(
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
    it('should sum prices of active agents', async () => {
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([
        { price: 100 },
        { price: 200 },
      ]);

      const result = await service.calculateClientTotal('client-1');
      expect(
        mockClientAgentRepository.findByClientAndStatus,
      ).toHaveBeenCalledWith('client-1', 'active');
      expect(result).toBe(300);
    });

    it('should return 0 if no active agents', async () => {
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([]);
      const result = await service.calculateClientTotal('client-1');
      expect(result).toBe(0);
    });
  });
});
