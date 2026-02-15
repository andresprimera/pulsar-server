import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SeederService } from './seeder.service';
import { Agent } from './schemas/agent.schema';
import { ClientPhone } from './schemas/client-phone.schema';
import { ClientAgent } from './schemas/client-agent.schema';
import { UserRepository } from './repositories/user.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { ClientRepository } from './repositories/client.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { ClientPhoneRepository } from './repositories/client-phone.repository';
import { OnboardingService } from '../onboarding/onboarding.service';
import { Logger } from '@nestjs/common';
import * as SEED_DATA from './data/seed-data.json';

describe('SeederService', () => {
  let service: SeederService;
  let mockAgentModel: any;
  let mockClientPhoneModel: any;
  let mockClientAgentModel: any;
  let mockUserRepository: any;
  let mockOnboardingService: any;
  let mockChannelRepository: any;
  let mockClientRepository: any;
  let mockClientAgentRepository: any;
  let mockClientPhoneRepository: any;
  let loggerSpy: jest.SpyInstance;

  const mockAgentId = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

  const mockOnboardingResult = {
    user: {
      _id: 'user-id',
      email: SEED_DATA.users[0].email,
      name: SEED_DATA.users[0].name,
      clientId: 'client-id',
      status: 'active',
    },
    client: {
      _id: 'client-id',
      type: SEED_DATA.users[0].client.type,
      name: SEED_DATA.users[0].name,
      ownerUserId: 'user-id',
      status: 'active',
    },
    clientAgent: {
      _id: 'client-agent-id',
      clientId: 'client-id',
      agentId: mockAgentId.toString(),
      price: SEED_DATA.users[0].agentHirings[0].price,
      status: 'active',
    },
  };

  beforeEach(async () => {
    mockAgentModel = {
      findOne: jest.fn(),
      create: jest.fn(),
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

    mockClientRepository = {
      findById: jest.fn(),
    };

    mockClientAgentRepository = {
      findByClient: jest.fn(),
      create: jest.fn(),
    };

    mockClientPhoneRepository = {
      resolveOrCreate: jest.fn(),
    };

    mockClientAgentModel = {
      createIndexes: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        {
          provide: getModelToken(Agent.name),
          useValue: mockAgentModel,
        },
        {
          provide: getModelToken(ClientPhone.name),
          useValue: mockClientPhoneModel,
        },
        {
          provide: getModelToken(ClientAgent.name),
          useValue: mockClientAgentModel,
        },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: ChannelRepository, useValue: mockChannelRepository },
        { provide: ClientRepository, useValue: mockClientRepository },
        { provide: ClientAgentRepository, useValue: mockClientAgentRepository },
        {
          provide: ClientPhoneRepository,
          useValue: mockClientPhoneRepository,
        },
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
      // No existing agents
      mockAgentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockAgentModel.create.mockResolvedValue({
        _id: mockAgentId,
        name: SEED_DATA.agents[0].name,
      });

      // Mock Channel resolutions
      mockChannelRepository.findOrCreateByName.mockResolvedValue({
        _id: 'channel-id',
        name: 'WhatsApp',
        supportedProviders: ['meta', 'twilio'],
      });

      await service.onApplicationBootstrap();

      expect(mockOnboardingService.registerAndHire).toHaveBeenCalled();
    });

    it('should seed in DEVELOPMENT by default', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SEED_DB;

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // No existing agents
      mockAgentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockAgentModel.create.mockResolvedValue({
        _id: mockAgentId,
        name: SEED_DATA.agents[0].name,
      });

      // Mock Channel resolutions
      mockChannelRepository.findOrCreateByName.mockResolvedValue({
        _id: 'channel-id',
        name: 'WhatsApp',
        supportedProviders: ['meta', 'twilio'],
      });

      await service.onApplicationBootstrap();

      // Verify agents creation (both agents should be created)
      expect(mockAgentModel.create).toHaveBeenCalledTimes(SEED_DATA.agents.length);
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: SEED_DATA.agents[0].name,
          systemPrompt: SEED_DATA.agents[0].systemPrompt,
          status: 'active',
          createdBySeeder: true,
        }),
      );
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: SEED_DATA.agents[1].name,
          systemPrompt: SEED_DATA.agents[1].systemPrompt,
          status: 'active',
          createdBySeeder: true,
        }),
      );

      // Verify indexes were built
      expect(mockClientPhoneModel.createIndexes).toHaveBeenCalled();

      // Verify onboarding was called with correct DTO structure (ClientAgent with channels)
      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: SEED_DATA.users[0].email }),
          channels: expect.arrayContaining([
            expect.objectContaining({
              channelId: 'channel-id',
              status: 'active',
            }),
          ]),
        }),
      );

      // Verify channel provisioning
      expect(mockChannelRepository.findOrCreateByName).toHaveBeenCalledTimes(
        SEED_DATA.channels.length,
      );
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
        email: SEED_DATA.users[0].email,
        clientId: 'existing-client-id',
      });

      // Mock consistency check - client and clientAgents exist
      mockClientRepository.findById.mockResolvedValue({
        _id: 'existing-client-id',
        name: 'Test Client',
      });
      mockClientAgentRepository.findByClient.mockResolvedValue([
        { _id: 'existing-client-agent-id' },
      ]);

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
      // Existing agents found
      mockAgentModel.findOne.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: mockAgentId, name: SEED_DATA.agents[0].name }),
      });

      // Mock Channel resolutions
      mockChannelRepository.findOrCreateByName.mockResolvedValue({
        _id: 'channel-id',
        name: 'WhatsApp',
        supportedProviders: ['meta', 'twilio'],
      });

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

    it('should use per-hiring channel credentials when building onboarding DTO', async () => {
      process.env.NODE_ENV = 'development';

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockAgentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockAgentModel.create.mockResolvedValue({
        _id: mockAgentId,
        name: SEED_DATA.agents[0].name,
      });

      mockChannelRepository.findOrCreateByName
        .mockResolvedValueOnce({
          _id: 'wa-channel-id',
          name: 'WhatsApp',
          supportedProviders: ['meta', 'twilio'],
        })
        .mockResolvedValueOnce({
          _id: 'tiktok-channel-id',
          name: 'TikTok',
          supportedProviders: ['tiktok'],
        })
        .mockResolvedValueOnce({
          _id: 'email-channel-id',
          name: 'Email',
          supportedProviders: ['smtp', 'sendgrid'],
        });

      await service.onApplicationBootstrap();

      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              channelId: 'wa-channel-id',
              provider: 'meta',
              credentials: expect.objectContaining({
                phoneNumberId:
                  SEED_DATA.users[0].agentHirings[0].channels[0].credentials
                    .phoneNumberId,
              }),
            }),
            expect.objectContaining({
              channelId: 'email-channel-id',
              provider: 'smtp',
              credentials: expect.objectContaining({
                email: 'codingboxapp@gmail.com',
              }),
            }),
          ]),
        }),
      );
    });

    it('should fail fast when an agent hiring has no channels', async () => {
      process.env.NODE_ENV = 'development';

      const originalChannels = SEED_DATA.users[0].agentHirings[0].channels;
      (SEED_DATA.users[0].agentHirings[0] as any).channels = [];

      try {
        mockUserRepository.findByEmail.mockResolvedValue(null);
        mockAgentModel.findOne.mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        });
        mockAgentModel.create.mockResolvedValue({
          _id: mockAgentId,
          name: SEED_DATA.agents[0].name,
        });
        mockChannelRepository.findOrCreateByName.mockResolvedValue({
          _id: 'channel-id',
          name: 'WhatsApp',
          supportedProviders: ['meta', 'twilio'],
        });

        await expect(service.onApplicationBootstrap()).rejects.toThrow(
          /Invalid seed-data\.json/,
        );
      } finally {
        (SEED_DATA.users[0].agentHirings[0] as any).channels = originalChannels;
      }
    });

    it('should use additional hiring phone number for client phone resolution', async () => {
      process.env.NODE_ENV = 'development';

      const originalUsers = SEED_DATA.users;
      (SEED_DATA as any).users = [SEED_DATA.users[2]];

      const customerServiceAgentId = new Types.ObjectId(
        'bbbbbbbbbbbbbbbbbbbbbbbb',
      );
      const salesAgentId = new Types.ObjectId('cccccccccccccccccccccccc');

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockAgentModel.findOne
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: customerServiceAgentId,
            name: SEED_DATA.agents[0].name,
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: salesAgentId,
            name: SEED_DATA.agents[1].name,
          }),
        });

      mockChannelRepository.findOrCreateByName
        .mockResolvedValueOnce({
          _id: 'wa-channel-id',
          name: 'WhatsApp',
          supportedProviders: ['meta', 'twilio'],
        })
        .mockResolvedValueOnce({
          _id: 'tiktok-channel-id',
          name: 'TikTok',
          supportedProviders: ['tiktok'],
        })
        .mockResolvedValueOnce({
          _id: 'email-channel-id',
          name: 'Email',
          supportedProviders: ['smtp', 'sendgrid'],
        });

      const onboardingResultForUser3 = {
        ...mockOnboardingResult,
        client: {
          ...mockOnboardingResult.client,
          _id: '507f1f77bcf86cd799439011',
        },
      };
      mockOnboardingService.registerAndHire.mockResolvedValueOnce(
        onboardingResultForUser3,
      );

      try {
        await service.onApplicationBootstrap();

        expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439011',
          '573332574069',
          { provider: 'meta' },
        );
      } finally {
        (SEED_DATA as any).users = originalUsers;
      }
    });
  });
});
