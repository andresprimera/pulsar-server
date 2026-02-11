import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SeederService } from './seeder.service';
import { Agent } from './schemas/agent.schema';
import { AgentChannel } from './schemas/agent-channel.schema';
import { ClientPhone } from './schemas/client-phone.schema';
import { UserRepository } from './repositories/user.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { OnboardingService } from '../onboarding/onboarding.service';
import { Logger } from '@nestjs/common';
import * as SEED_DATA from './data/seed-data.json';

describe('SeederService', () => {
  let service: SeederService;
  let mockAgentModel: any;
  let mockAgentChannelModel: any;
  let mockClientPhoneModel: any;
  let mockUserRepository: any;
  let mockOnboardingService: any;
  let mockChannelRepository: any;
  let loggerSpy: jest.SpyInstance;

  const mockAgentId = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

  const mockOnboardingResult = {
    user: {
      _id: 'user-id',
      email: SEED_DATA.user.email,
      name: SEED_DATA.user.name,
      clientId: 'client-id',
      status: 'active',
    },
    client: {
      _id: 'client-id',
      type: SEED_DATA.client.type,
      name: SEED_DATA.user.name,
      ownerUserId: 'user-id',
      status: 'active',
    },
    clientAgent: {
      _id: 'client-agent-id',
      clientId: 'client-id',
      agentId: mockAgentId.toString(),
      price: SEED_DATA.agentHiring.price,
      status: 'active',
    },
    agentChannels: [
      {
        _id: 'agent-channel-id',
        clientId: 'client-id',
        agentId: mockAgentId.toString(),
        channelId: 'channel-id',
        status: 'active',
      },
    ],
  };

  beforeEach(async () => {
    mockAgentModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockAgentChannelModel = {
      createIndexes: jest.fn().mockResolvedValue(undefined),
    };

    mockClientPhoneModel = {
      createIndexes: jest.fn().mockResolvedValue(undefined),
    };

    mockUserRepository = {
      findByEmail: jest.fn(),
    };

    mockOnboardingService = {
      registerAndHire: jest.fn().mockResolvedValue(mockOnboardingResult),
    };

    mockChannelRepository = {
      findOrCreateByName: jest.fn(),
      findByNameOrFail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        {
          provide: getModelToken(Agent.name),
          useValue: mockAgentModel,
        },
        {
          provide: getModelToken(AgentChannel.name),
          useValue: mockAgentChannelModel,
        },
        {
          provide: getModelToken(ClientPhone.name),
          useValue: mockClientPhoneModel,
        },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: ChannelRepository, useValue: mockChannelRepository },
      ],
    }).compile();

    service = module.get<SeederService>(SeederService);
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.SEED_DB;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('should skip seeding in PRODUCTION if SEED_DB is not true', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SEED_DB;

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping seeding'),
      );
      expect(mockOnboardingService.registerAndHire).not.toHaveBeenCalled();
    });

    it('should seed in PRODUCTION if SEED_DB is true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SEED_DB = 'true';

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // No existing agent
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockAgentModel.create.mockResolvedValue({ _id: mockAgentId, name: SEED_DATA.agent.name });

      // Mock Channel resolutions
      mockChannelRepository.findOrCreateByName.mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' });
      mockChannelRepository.findByNameOrFail.mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' });

      await service.onApplicationBootstrap();

      expect(mockOnboardingService.registerAndHire).toHaveBeenCalled();
    });

    it('should seed in DEVELOPMENT by default', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SEED_DB;

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // No existing agent
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockAgentModel.create.mockResolvedValue({ _id: mockAgentId, name: SEED_DATA.agent.name });

      // Mock Channel resolutions
      mockChannelRepository.findOrCreateByName.mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' });
      mockChannelRepository.findByNameOrFail.mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' });


      await service.onApplicationBootstrap();

      // Verify agent creation
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: SEED_DATA.agent.name,
          systemPrompt: SEED_DATA.agent.systemPrompt,
          status: 'active',
          createdBySeeder: true,
        }),
      );

      // Verify indexes were built
      expect(mockAgentChannelModel.createIndexes).toHaveBeenCalled();
      expect(mockClientPhoneModel.createIndexes).toHaveBeenCalled();

      // Verify onboarding was called with correct DTO structure (ClientAgent with channels)
      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: SEED_DATA.user.email }),
          channels: expect.arrayContaining([
              expect.objectContaining({
                  channelId: 'channel-id',
                  status: 'active'
              })
          ])
        })
      );

      // Verify channel provisioning
      expect(mockChannelRepository.findOrCreateByName).toHaveBeenCalledTimes(SEED_DATA.channels.length);
    });

    it('should skip seeding in DEVELOPMENT if SEED_DB is false', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SEED_DB = 'false';

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping seeding'),
      );
      expect(mockOnboardingService.registerAndHire).not.toHaveBeenCalled();
    });

    it('should skip seeding if user already exists (idempotency)', async () => {
      process.env.NODE_ENV = 'development';

      // Existing user found
      mockUserRepository.findByEmail.mockResolvedValue({
        _id: 'existing-user-id',
        email: SEED_DATA.user.email,
      });

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('already exists. Skipping seeding'),
      );
      expect(mockOnboardingService.registerAndHire).not.toHaveBeenCalled();
    });

    it('should reuse existing agent if found', async () => {
      process.env.NODE_ENV = 'development';

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // Existing agent found
      mockAgentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: mockAgentId, name: SEED_DATA.agent.name }),
      });

      // Mock Channel resolutions
      mockChannelRepository.findOrCreateByName.mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' });
      mockChannelRepository.findByNameOrFail.mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' });

      await service.onApplicationBootstrap();

      // Agent should not be created
      expect(mockAgentModel.create).not.toHaveBeenCalled();
      // Onboarding should still be called with existing agent ID
      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          agentHiring: expect.objectContaining({
            agentId: mockAgentId.toString(),
          }),
        }),
      );
    });
  });
});
