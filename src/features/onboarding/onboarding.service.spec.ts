import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { OnboardingService } from './onboarding.service';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { HireChannelLifecyclePublisher } from '@orchestrator/lifecycle/hire-channel-lifecycle.publisher';
import { HIRE_CHANNEL_LIFECYCLE_PORT } from '@shared/ports/hire-channel-lifecycle.port';

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getConnectionToken(), useValue: {} },
        { provide: ClientRepository, useValue: {} },
        { provide: UserRepository, useValue: {} },
        { provide: AgentRepository, useValue: {} },
        { provide: ChannelRepository, useValue: {} },
        { provide: ClientAgentRepository, useValue: {} },
        { provide: PersonalityRepository, useValue: {} },
        { provide: AgentPriceRepository, useValue: {} },
        { provide: ChannelPriceRepository, useValue: {} },
        { provide: ClientPhoneRepository, useValue: {} },
        {
          provide: HireChannelLifecyclePublisher,
          useValue: {
            publishHappyPath: jest.fn(),
            publishProbe: jest.fn(),
          },
        },
        {
          provide: HIRE_CHANNEL_LIFECYCLE_PORT,
          useValue: {
            recordOutcome: jest.fn(),
            loadForRegistration: jest.fn(),
            quarantineTelegramRegistration: jest.fn(),
            findReconcilableTelegramHires: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
