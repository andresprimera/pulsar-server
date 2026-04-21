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
import { PersonalityRepository } from './repositories/personality.repository';
import { ClientPhoneRepository } from './repositories/client-phone.repository';
import { AgentPriceRepository } from './repositories/agent-price.repository';
import { ChannelPriceRepository } from './repositories/channel-price.repository';
import { OnboardingService } from '@onboarding/onboarding.service';
import { BadRequestException, Logger } from '@nestjs/common';
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
  let mockPersonalityRepository: any;
  let mockClientPhoneRepository: any;
  let mockAgentPriceRepository: any;
  let mockChannelPriceRepository: any;
  let loggerSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

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
      agentPricing: {
        amount: SEED_DATA.users[0].agentHirings[0].price,
        currency: 'USD',
      },
      status: 'active',
    },
  };

  beforeEach(async () => {
    process.env.SECRET_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
      registerAndHire: jest.fn().mockImplementation(async (dto: any) => {
        if (dto?.client?.type === 'organization' && !dto?.client?.name) {
          throw new BadRequestException(
            'Client name is required for organization type',
          );
        }

        return mockOnboardingResult;
      }),
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
      create: jest.fn().mockResolvedValue({
        _id: 'additional-client-agent-id',
      }),
    };

    const defaultPersonalityId = new Types.ObjectId('507f1f77bcf86cd799439099');
    mockPersonalityRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        _id: defaultPersonalityId,
        name: 'Default',
        description: '',
        promptTemplate: '',
        status: 'active',
        version: 1,
      }),
    };

    mockClientPhoneRepository = {
      resolveOrCreate: jest.fn(),
    };

    mockAgentPriceRepository = {
      upsert: jest.fn().mockResolvedValue({}),
    };

    mockChannelPriceRepository = {
      findActiveByChannelAndCurrency: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
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
          provide: PersonalityRepository,
          useValue: mockPersonalityRepository,
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
      ],
    }).compile();

    service = module.get<SeederService>(SeederService);
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerSpy?.mockRestore();
    loggerWarnSpy?.mockRestore();
    loggerErrorSpy?.mockRestore();
    delete process.env.NODE_ENV;
    delete process.env.SEED_DB;
    delete process.env.SECRET_ENCRYPTION_KEY;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should seed only WhatsApp, TikTok, and Instagram with multichannel coverage', () => {
    const channelNames = SEED_DATA.channels.map((channel) => channel.name);
    expect(channelNames).toEqual(
      expect.arrayContaining(['WhatsApp', 'TikTok', 'Instagram']),
    );
    expect(channelNames).not.toContain('Email');

    const combos = new Set<string>();
    for (const user of SEED_DATA.users) {
      for (const hiring of user.agentHirings) {
        const key = hiring.channels
          .map((channel) => channel.channelName)
          .sort()
          .join('+');
        combos.add(key);
      }
    }

    expect(combos.has('Instagram+WhatsApp')).toBe(true);
    expect(combos.has('Instagram+TikTok')).toBe(true);
    expect(combos.has('TikTok+WhatsApp')).toBe(true);
    // Seed data has no single hiring with all three channels; coverage is across users/hirings
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

      // Verify catalog pre-seed: one AgentPrice and one ChannelPrice per entity in default currency
      expect(mockAgentPriceRepository.upsert).toHaveBeenCalledTimes(
        SEED_DATA.agents.length,
      );
      expect(mockChannelPriceRepository.upsert).toHaveBeenCalledTimes(
        SEED_DATA.channels.length,
      );

      // Verify agents creation (all seed agents should be created)
      expect(mockAgentModel.create).toHaveBeenCalledTimes(
        SEED_DATA.agents.length,
      );
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: SEED_DATA.agents[0].name,
          systemPrompt: SEED_DATA.agents[0].systemPrompt,
          status: 'active',
          createdBySeeder: true,
          toolingProfileId: 'internal-debug',
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
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: SEED_DATA.agents[2].name,
          systemPrompt: SEED_DATA.agents[2].systemPrompt,
          status: 'active',
          createdBySeeder: true,
          toolingProfileId: 'sales-catalog',
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
        undefined,
      );
      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: SEED_DATA.users[2].email }),
        }),
        { fixedClientMongoId: 'deadbeefdeadbeefdeadbeef' },
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
        exec: jest.fn().mockResolvedValue({
          _id: mockAgentId,
          name: SEED_DATA.agents[0].name,
        }),
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
        undefined,
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
          _id: 'instagram-channel-id',
          name: 'Instagram',
          supportedProviders: ['instagram'],
        });

      await service.onApplicationBootstrap();

      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              channelId: 'wa-channel-id',
              provider: 'meta',
              credentials: expect.objectContaining({
                phoneNumberId: (
                  SEED_DATA.users[0].agentHirings[0].channels[0]
                    .credentials as { phoneNumberId: string }
                ).phoneNumberId,
              }),
            }),
            expect.objectContaining({
              channelId: 'instagram-channel-id',
              provider: 'instagram',
              credentials: expect.objectContaining({
                instagramAccountId: (
                  SEED_DATA.users[0].agentHirings[0].channels[1]
                    .credentials as any
                ).instagramAccountId,
              }),
            }),
          ]),
        }),
        undefined,
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
      const seedUser = SEED_DATA.users[2];
      // Second hiring must include a WhatsApp channel so resolveOrCreate is called for additional hiring
      const secondHiringWithWhatsApp = {
        ...seedUser.agentHirings[1],
        channels: [
          {
            channelName: 'WhatsApp',
            provider: 'twilio',
            status: 'active',
            credentials: { phoneNumberId: '+14155238886' },
            llmConfig: {
              provider: 'openai',
              apiKey: '__REPLACE_ME_API_KEY__',
              model: 'gpt-4o',
            },
          },
          ...seedUser.agentHirings[1].channels,
        ],
      };
      (SEED_DATA as any).users = [
        {
          ...seedUser,
          agentHirings: [seedUser.agentHirings[0], secondHiringWithWhatsApp],
        },
      ];

      const customerServiceAgentId = new Types.ObjectId(
        'bbbbbbbbbbbbbbbbbbbbbbbb',
      );
      const salesAgentId = new Types.ObjectId('cccccccccccccccccccccccc');
      const orderSalesAgentId = new Types.ObjectId('dddddddddddddddddddddddd');

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
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            _id: orderSalesAgentId,
            name: SEED_DATA.agents[2].name,
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
          _id: 'instagram-channel-id',
          name: 'Instagram',
          supportedProviders: ['instagram'],
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

      mockClientRepository.findById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        billingAnchor: new Date(),
        billingCurrency: 'USD',
      });

      const expectedPhoneNumberId = '+14155238886';

      try {
        await service.onApplicationBootstrap();

        expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439011',
          expectedPhoneNumberId,
          { provider: 'twilio' },
        );
      } finally {
        (SEED_DATA as any).users = originalUsers;
      }
    });

    it('should retry onboarding when transient transaction error occurs', async () => {
      process.env.NODE_ENV = 'development';

      const originalUsers = SEED_DATA.users;
      (SEED_DATA as any).users = [SEED_DATA.users[0]];

      const transientError: any = new Error(
        'Please retry your operation or multi-document transaction.',
      );
      transientError.errorLabels = ['TransientTransactionError'];

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
          _id: 'instagram-channel-id',
          name: 'Instagram',
          supportedProviders: ['instagram'],
        });

      mockOnboardingService.registerAndHire
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue(mockOnboardingResult);

      try {
        await service.onApplicationBootstrap();

        expect(mockOnboardingService.registerAndHire).toHaveBeenCalledTimes(2);
      } finally {
        (SEED_DATA as any).users = originalUsers;
      }
    });

    it('should throw when transient transaction keeps failing after max retries', async () => {
      process.env.NODE_ENV = 'development';

      const originalUsers = SEED_DATA.users;
      (SEED_DATA as any).users = [SEED_DATA.users[0]];

      const transientError: any = new Error(
        'Please retry your operation or multi-document transaction.',
      );
      transientError.errorLabels = ['TransientTransactionError'];

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
          _id: 'instagram-channel-id',
          name: 'Instagram',
          supportedProviders: ['instagram'],
        });

      mockOnboardingService.registerAndHire.mockRejectedValue(transientError);

      try {
        await expect(service.onApplicationBootstrap()).rejects.toThrow(
          /Please retry your operation or multi-document transaction/,
        );
        expect(mockOnboardingService.registerAndHire).toHaveBeenCalledTimes(3);
      } finally {
        (SEED_DATA as any).users = originalUsers;
      }
    });

    it('should pass organization client name to onboarding', async () => {
      process.env.NODE_ENV = 'development';

      const originalUsers = SEED_DATA.users;
      const seedUser = SEED_DATA.users[1];
      (SEED_DATA as any).users = [seedUser];

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockAgentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockAgentModel.create.mockResolvedValue({
        _id: mockAgentId,
        name: SEED_DATA.agents[1].name,
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
          _id: 'instagram-channel-id',
          name: 'Instagram',
          supportedProviders: ['instagram'],
        });

      try {
        await service.onApplicationBootstrap();

        expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
          expect.objectContaining({
            client: expect.objectContaining({
              type: 'organization',
              name: (seedUser.client as any).name,
            }),
          }),
          undefined,
        );
      } finally {
        (SEED_DATA as any).users = originalUsers;
      }
    });
  });
});
