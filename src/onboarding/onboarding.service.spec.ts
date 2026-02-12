import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OnboardingService } from './onboarding.service';
import { ClientRepository } from '../database/repositories/client.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { AgentRepository } from '../database/repositories/agent.repository';
import { ChannelRepository } from '../database/repositories/channel.repository';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { ClientPhoneRepository } from '../database/repositories/client-phone.repository';
import { LlmProvider } from '../agent/llm/provider.enum';
import { ChannelProvider } from '../channels/channel-provider.enum';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let mockSession: any;
  let mockConnection: any;
  let mockClientRepository: any;
  let mockUserRepository: any;
  let mockAgentRepository: any;
  let mockChannelRepository: any;
  let mockClientAgentRepository: any;
  let mockClientPhoneRepository: any;

  const mockClient = {
    _id: 'client-1',
    name: 'Test Client',
    type: 'individual',
    status: 'active',
    toObject: () => ({
      _id: 'client-1',
      name: 'Test Client',
      type: 'individual',
      status: 'active',
    }),
  };

  const mockUser = {
    _id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    clientId: 'client-1',
    status: 'active',
    toObject: () => ({
      _id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      clientId: 'client-1',
      status: 'active',
    }),
  };

  const mockAgent = {
    _id: 'agent-1',
    name: 'Test Agent',
    status: 'active',
  };

  const mockChannel = {
    _id: '507f1f77bcf86cd799439011',
    name: 'whatsapp-main',
    type: 'whatsapp',
    supportedProviders: ['meta'],
  };

  const mockClientAgent = {
    _id: 'client-agent-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    price: 100,
    status: 'active',
    channels: [],
    toObject: () => ({
      _id: 'client-agent-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      price: 100,
      status: 'active',
      channels: [],
    }),
  };

  const mockClientPhone = {
    _id: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    clientId: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    phoneNumberId: '123',
    provider: 'meta',
  };

  beforeEach(async () => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    mockClientRepository = {
      create: jest.fn().mockResolvedValue(mockClient),
      update: jest.fn().mockResolvedValue(mockClient),
    };

    mockUserRepository = {
      create: jest.fn().mockResolvedValue(mockUser),
      findByEmail: jest.fn().mockResolvedValue(null),
    };

    mockAgentRepository = {
      validateHireable: jest.fn().mockResolvedValue(mockAgent),
    };

    mockChannelRepository = {
      findByIdOrFail: jest.fn().mockResolvedValue(mockChannel),
      create: jest.fn(),
    };

    mockClientAgentRepository = {
      create: jest.fn().mockResolvedValue(mockClientAgent),
    };

    mockClientPhoneRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue(null),
      resolveOrCreate: jest.fn().mockResolvedValue(mockClientPhone),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: ClientRepository, useValue: mockClientRepository },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: AgentRepository, useValue: mockAgentRepository },
        { provide: ChannelRepository, useValue: mockChannelRepository },
        { provide: ClientAgentRepository, useValue: mockClientAgentRepository },
        { provide: ClientPhoneRepository, useValue: mockClientPhoneRepository },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerAndHire', () => {
    const validDto = {
      user: { email: 'TEST@example.com', name: 'Test User' },
      client: { type: 'individual' as const },
      agentHiring: { agentId: 'agent-1', price: 100 },
      channels: [
        {
          channelId: '507f1f77bcf86cd799439011',
          provider: ChannelProvider.Meta,
          status: 'active' as const,
          credentials: { phoneNumberId: '123' },
          llmConfig: {
            provider: LlmProvider.OpenAI,
            apiKey: 'key',
            model: 'gpt-4',
          },
        },
      ],
    };

    it('should complete full registration flow successfully', async () => {
      const result = await service.registerAndHire(validDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('client');
      expect(result).toHaveProperty('clientAgent');
      expect(result).toHaveProperty('agentChannels');
      expect(result.agentChannels).toEqual([]); // No longer returns agent channels directly

      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should normalize email to lowercase and trim', async () => {
      await service.registerAndHire(validDto);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
        mockSession,
      );
    });

    it('should use user name as client name when client.name is not provided', async () => {
      await service.registerAndHire(validDto);

      expect(mockClientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test User' }),
        mockSession,
      );
    });

    it('should use explicit client name when provided', async () => {
      const dtoWithClientName = {
        ...validDto,
        client: { type: 'individual' as const, name: 'Custom Client Name' },
      };

      await service.registerAndHire(dtoWithClientName);

      expect(mockClientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Custom Client Name' }),
        mockSession,
      );
    });

    it('should throw ConflictException if user email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        'User with this email already exists',
      );
    });

    it('should throw BadRequestException when agent is not hireable', async () => {
      mockAgentRepository.validateHireable.mockRejectedValue(
        new BadRequestException('Agent is not currently available'),
      );

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when organization type has no name', async () => {
      const dtoWithOrgNoName = {
        ...validDto,
        client: { type: 'organization' as const },
      };

      await expect(service.registerAndHire(dtoWithOrgNoName)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.registerAndHire(dtoWithOrgNoName)).rejects.toThrow(
        'Client name is required for organization type',
      );
    });

    it('should allow same phone number to be used by multiple channels of the same client', async () => {
      const dtoWithSamePhoneMultipleChannels = {
        ...validDto,
        channels: [
          {
            channelId: '507f1f77bcf86cd799439011',
            provider: ChannelProvider.Meta,
            status: 'active' as const,
            credentials: { phoneNumberId: '123' },
            llmConfig: {
              provider: LlmProvider.OpenAI,
              apiKey: 'key',
              model: 'gpt-4',
            },
          },
          {
            channelId: '507f1f77bcf86cd799439012', // Different channel ID
            provider: ChannelProvider.Meta, 
            status: 'active' as const,
            credentials: { phoneNumberId: '123' }, // Same phone number
            llmConfig: {
              provider: LlmProvider.OpenAI,
              apiKey: 'key',
              model: 'gpt-4',
            },
          },
        ],
      };

      // Mock finding both channels
      const channel1 = { ...mockChannel, _id: 'channel-1' };
      const channel2 = { ...mockChannel, _id: 'channel-2' };
      
      mockChannelRepository.findByIdOrFail.mockImplementation((id) => {
          if (id === '507f1f77bcf86cd799439011') return Promise.resolve(channel1);
          if (id === '507f1f77bcf86cd799439012') return Promise.resolve(channel2);
          return Promise.reject(new NotFoundException());
      });

      // Should succeed - same phone can be used by multiple channels
      await service.registerAndHire(dtoWithSamePhoneMultipleChannels);

      // resolveOrCreate called twice but returns same ClientPhone (mock)
      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledTimes(2);
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
              channels: expect.arrayContaining([
                  expect.objectContaining({ channelId: new Types.ObjectId('507f1f77bcf86cd799439011') }),
                  expect.objectContaining({ channelId: new Types.ObjectId('507f1f77bcf86cd799439012') }),
              ])
          }),
          mockSession
      );
    });

    it('should resolve or create ClientPhone during registration', async () => {
      await service.registerAndHire(validDto);

      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
        'client-1', // client ID (string from mock)
        '123',
        expect.objectContaining({
          provider: 'meta',
          session: mockSession,
        }),
      );
    });

    it('should throw BadRequestException for duplicate channel IDs in request', async () => {
      const dtoWithDuplicateChannels = {
        ...validDto,
        channels: [
          {
            channelId: '507f1f77bcf86cd799439011',
            provider: ChannelProvider.Meta,
            status: 'active' as const,
            credentials: { phoneNumberId: '123' },
            llmConfig: {
              provider: LlmProvider.OpenAI,
              apiKey: 'key',
              model: 'gpt-4',
            },
          },
          {
            channelId: '507f1f77bcf86cd799439011', // Duplicate ID
            provider: ChannelProvider.Meta,
            status: 'active' as const,
            credentials: { phoneNumberId: '123' },
            llmConfig: {
              provider: LlmProvider.OpenAI,
              apiKey: 'key',
              model: 'gpt-4',
            },
          },
        ],
      };

      await expect(
        service.registerAndHire(dtoWithDuplicateChannels),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.registerAndHire(dtoWithDuplicateChannels),
      ).rejects.toThrow(/Duplicate channelId/);
    });

    it('should throw BadRequestException if provider is not supported', async () => {
         const dtoWithInvalidProvider = {
        ...validDto,
        channels: [
          {
            channelId: '507f1f77bcf86cd799439011',
              provider: 'unsupported-provider' as unknown as ChannelProvider,
            status: 'active' as const,
            credentials: { phoneNumberId: '123' },
            llmConfig: {
              provider: LlmProvider.OpenAI,
              apiKey: 'key',
              model: 'gpt-4',
            },
          },
        ],
      };

      await expect(
        service.registerAndHire(dtoWithInvalidProvider),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.registerAndHire(dtoWithInvalidProvider),
      ).rejects.toThrow(/not supported/);
    });

    it('should abort transaction on error during writes', async () => {
      const duplicateError = {
        code: 11000,
        keyPattern: { email: 1 },
        message: 'duplicate key error collection: db.users index: email_1',
      };
      mockUserRepository.create.mockRejectedValue(duplicateError);

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        ConflictException,
      );

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should update client with ownerUserId after creating user', async () => {
      await service.registerAndHire(validDto);

      expect(mockClientRepository.update).toHaveBeenCalledWith(
        'client-1',
        expect.objectContaining({ ownerUserId: expect.anything() }),
        mockSession,
      );
    });

    it('should throw NotFoundException if channel does not exist', async () => {
      mockChannelRepository.findByIdOrFail.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
