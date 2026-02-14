import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRepository } from './repositories/user.repository';
import { Agent } from './schemas/agent.schema';

import { ClientPhone } from './schemas/client-phone.schema';
import { ClientAgent } from './schemas/client-agent.schema';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ChannelRepository } from './repositories/channel.repository';
import * as SEED_DATA from './data/seed-data.json';
import { ClientRepository } from './repositories/client.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly userRepository: UserRepository,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    @InjectModel(ClientPhone.name)
    private readonly clientPhoneModel: Model<ClientPhone>,
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboardingService: OnboardingService,
    private readonly channelRepository: ChannelRepository,
    private readonly clientRepository: ClientRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    @InjectModel(ClientAgent.name)
    private readonly clientAgentModel: Model<ClientAgent>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pulsar';
    this.logger.log(
      `Connected to Database: ${uri.replace(/:([^:@]+)@/, ':****@')}`,
    );

    const isProd = process.env.NODE_ENV === 'production';
    const startSeed = isProd
      ? process.env.SEED_DB === 'true' // Prod: Must be explicit
      : process.env.SEED_DB !== 'false'; // Dev: Default on, explicit off

    if (!startSeed) {
      this.logger.log(
        `Skipping seeding (NODE_ENV=${process.env.NODE_ENV}, SEED_DB=${process.env.SEED_DB})`,
      );
      return;
    }

    await this.seed();
  }

  private async seed(): Promise<void> {
    this.logger.log('Starting database seed...');

    try {
      // Idempotency check: if seed user exists, skip entire seeding
      const existingUser = await this.userRepository.findByEmail(
        SEED_DATA.user.email,
      );
      if (existingUser) {
        // Check for consistency: if user exists, Client and ClientAgent MUST exist
        const client = await this.clientRepository.findById(
          (existingUser.clientId as any).toString(),
        );
        const clientAgents = await this.clientAgentRepository.findByClient(
          (existingUser.clientId as any).toString(),
        );

        if (!client || clientAgents.length === 0) {
          this.logger.error(
            `[Seeder] Inconsistent state detected: Seed user "${SEED_DATA.user.email}" exists, but Client or ClientAgent is missing.`,
          );
          throw new Error(
            `Database is in an inconsistent state. Seed user exists but Client/Agent data is missing. Please drop the database or remove the seed user manually to fix this.`,
          );
        }

        this.logger.log(
          `Seed user "${SEED_DATA.user.email}" already exists. Skipping seeding.`,
        );
        return;
      }

      // 1. Ensure Agent exists (required for onboarding)
      let agent = await this.agentModel
        .findOne({ name: SEED_DATA.agent.name })
        .exec();
      if (!agent) {
        this.logger.log(`Creating Agent: ${SEED_DATA.agent.name}`);
        agent = await this.agentModel.create({
          name: SEED_DATA.agent.name,
          systemPrompt: SEED_DATA.agent.systemPrompt,
          status: SEED_DATA.agent.status,
          createdBySeeder: true,
        });
      } else {
        this.logger.log(
          `Agent "${SEED_DATA.agent.name}" already exists (${agent._id})`,
        );
      }

      // 2. Ensure Channels exist (Infrastructure provisioning)
      this.logger.log('Provisioning channels...');
      for (const channelSeed of SEED_DATA.channels) {
        await this.channelRepository.findOrCreateByName(channelSeed.name, {
          type: channelSeed.type as any,
          supportedProviders: channelSeed.supportedProviders.map((p) =>
            p.toLowerCase(),
          ),
        });
      }

      // Ensure indexes are built before transaction starts to avoid "catalog changes" error
      this.logger.log('Ensuring indexes are built...');
      await Promise.all([
        this.clientPhoneModel.createIndexes(),
        this.clientAgentModel.createIndexes(),
      ]);

      // 3. Map Seed Data to HireChannelConfigDto (Resolve Channel IDs)
      const channelsDto = [];
      for (const channelSeed of SEED_DATA.channels) {
        const channelDoc = await this.channelRepository.findByNameOrFail(
          channelSeed.name,
        );
        // Use provider from existing config/structure or robust default
        // Assuming seed data might have a preferred provider logic, otherwise default to first supported
        // Ideally seed data should specify the provider to use for the agent
        const provider =
          (channelSeed as any).defaultProvider ||
          channelSeed.supportedProviders[0];

        channelsDto.push({
          channelId: channelDoc._id.toString(),
          provider: provider,
          status: 'active',
          credentials: channelSeed.agentChannelConfig.channelConfig,
          // Note: OnboardingService automatically extracts phoneNumberId/email
          // from credentials and populates the unencrypted fields.
          llmConfig: channelSeed.agentChannelConfig.llmConfig,
        });
      }

      // 4. Use OnboardingService to create User, Client, ClientAgent, and ClientPhone
      this.logger.log('Running onboarding flow for seed user...');
      const result = await this.onboardingService.registerAndHire({
        user: {
          email: SEED_DATA.user.email,
          name: SEED_DATA.user.name,
        },
        client: {
          type: SEED_DATA.client.type as any,
        },
        agentHiring: {
          agentId: agent._id.toString(),
          price: SEED_DATA.agentHiring.price,
        },
        channels: channelsDto as any,
      });

      this.logger.log(`Seeding complete via onboarding:`);
      this.logger.log(`  - User: ${result.user._id} (${result.user.email})`);
      this.logger.log(
        `  - Client: ${result.client._id} (${result.client.name})`,
      );
      this.logger.log(`  - ClientAgent: ${result.clientAgent._id}`);
    } catch (error) {
      this.logger.error('Seeding failed', error);
      // Re-throw if it's our specific consistency error, otherwise log and continue
      if (error.message.includes('Database is in an inconsistent state')) {
          throw error;
      }
    }
  }
}
