import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRepository } from './repositories/user.repository';
import { Agent } from './schemas/agent.schema';

import { ClientPhone } from './schemas/client-phone.schema';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ChannelRepository } from './repositories/channel.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { ClientPhoneRepository } from './repositories/client-phone.repository';
import { encryptRecord, encrypt } from './utils/crypto.util';
import * as SEED_DATA from './data/seed-data.json';

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
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
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
      // Idempotency check: if first seed user exists, skip entire seeding
      const existingUser = await this.userRepository.findByEmail(
        SEED_DATA.users[0].email,
      );
      if (existingUser) {
        this.logger.log(
          `Seed user "${SEED_DATA.users[0].email}" already exists. Skipping seeding.`,
        );
        return;
      }

      // 1. Ensure Agents exist (required for onboarding)
      const agentsMap = new Map();
      for (const agentSeed of SEED_DATA.agents) {
        let agent = await this.agentModel
          .findOne({ name: agentSeed.name })
          .exec();
        if (!agent) {
          this.logger.log(`Creating Agent: ${agentSeed.name}`);
          agent = await this.agentModel.create({
            name: agentSeed.name,
            systemPrompt: agentSeed.systemPrompt,
            status: agentSeed.status,
            createdBySeeder: true,
          });
        } else {
          this.logger.log(
            `Agent "${agentSeed.name}" already exists (${agent._id})`,
          );
        }
        agentsMap.set(agentSeed.name, agent);
      }

      // 2. Ensure Channels exist (Infrastructure provisioning)
      this.logger.log('Provisioning channels...');
      const channelsMap = new Map();
      for (const channelSeed of SEED_DATA.channels) {
        const channel = await this.channelRepository.findOrCreateByName(
          channelSeed.name,
          {
            type: channelSeed.type as any,
            supportedProviders: channelSeed.supportedProviders.map((p) =>
              p.toLowerCase(),
            ),
          },
        );
        channelsMap.set(channelSeed.name, {
          channel,
          config: channelSeed.agentChannelConfig,
        });
      }

      // Ensure indexes are built before transaction starts to avoid "catalog changes" error
      this.logger.log('Ensuring indexes are built...');
      await Promise.all([this.clientPhoneModel.createIndexes()]);

      // 3. Process each user
      for (const userSeed of SEED_DATA.users) {
        this.logger.log(
          `Processing user: ${userSeed.email} (${userSeed.name})`,
        );

        // Check if user already exists
        const existingUserCheck = await this.userRepository.findByEmail(
          userSeed.email,
        );
        if (existingUserCheck) {
          this.logger.log(
            `User "${userSeed.email}" already exists. Skipping.`,
          );
          continue;
        }

        // If user has no agent hirings, skip (for now, as onboarding requires an agent)
        if (!userSeed.agentHirings || userSeed.agentHirings.length === 0) {
          this.logger.log(
            `User "${userSeed.email}" has no agents to hire. Skipping for now.`,
          );
          continue;
        }

        // Process first agent hiring using onboarding service
        const firstAgentHiring = userSeed.agentHirings[0];
        const firstAgent = agentsMap.get(firstAgentHiring.agentName);
        if (!firstAgent) {
          this.logger.warn(
            `Agent "${firstAgentHiring.agentName}" not found for user "${userSeed.email}". Skipping user.`,
          );
          continue;
        }

        // Build channels DTO based on user's channel names
        const channelsDto = [];
        for (const channelName of userSeed.channelNames) {
          const channelInfo = channelsMap.get(channelName);
          if (!channelInfo) {
            this.logger.warn(
              `Channel "${channelName}" not found for user "${userSeed.email}". Skipping.`,
            );
            continue;
          }

          const provider =
            (channelInfo.config as any).defaultProvider ||
            channelInfo.channel.supportedProviders[0];

          channelsDto.push({
            channelId: channelInfo.channel._id.toString(),
            provider: provider,
            status: 'active',
            credentials: channelInfo.config.channelConfig,
            llmConfig: channelInfo.config.llmConfig,
          });
        }

        if (channelsDto.length === 0) {
          this.logger.warn(
            `No valid channels for user "${userSeed.email}". Skipping.`,
          );
          continue;
        }

        // Use OnboardingService to create User, Client, and first ClientAgent
        this.logger.log(
          `Running onboarding flow for user "${userSeed.email}" with agent "${firstAgentHiring.agentName}"...`,
        );
        const result = await this.onboardingService.registerAndHire({
          user: {
            email: userSeed.email,
            name: userSeed.name,
          },
          client: {
            type: userSeed.client.type as any,
          },
          agentHiring: {
            agentId: firstAgent._id.toString(),
            price: firstAgentHiring.price,
          },
          channels: channelsDto as any,
        });

        this.logger.log(`User onboarded successfully:`);
        this.logger.log(`  - User: ${result.user._id} (${result.user.email})`);
        this.logger.log(
          `  - Client: ${result.client._id} (${result.client.name})`,
        );
        this.logger.log(`  - ClientAgent: ${result.clientAgent._id}`);

        // Process additional agent hirings if any
        if (userSeed.agentHirings.length > 1) {
          for (let i = 1; i < userSeed.agentHirings.length; i++) {
            const additionalHiring = userSeed.agentHirings[i];
            const additionalAgent = agentsMap.get(additionalHiring.agentName);
            if (!additionalAgent) {
              this.logger.warn(
                `Agent "${additionalHiring.agentName}" not found for additional hiring. Skipping.`,
              );
              continue;
            }

            // Prepare channels for additional agent
            const additionalChannels = [];
            for (const channelName of userSeed.channelNames) {
              const channelInfo = channelsMap.get(channelName);
              if (!channelInfo) {
                continue;
              }

              const provider =
                (channelInfo.config as any).defaultProvider ||
                channelInfo.channel.supportedProviders[0];

              // Handle phone number for WhatsApp channels
              let phoneNumberId: string | undefined;
              if (
                channelInfo.config.channelConfig &&
                'phoneNumberId' in channelInfo.config.channelConfig
              ) {
                phoneNumberId = channelInfo.config.channelConfig.phoneNumberId;
              }

              if (phoneNumberId) {
                // Ensure ClientPhone exists for this phone number
                await this.clientPhoneRepository.resolveOrCreate(
                  new Types.ObjectId(result.client._id),
                  phoneNumberId,
                  {
                    provider: provider.toLowerCase() as any,
                  },
                );
              }

              additionalChannels.push({
                channelId: new Types.ObjectId(channelInfo.channel._id.toString()),
                provider: provider.toLowerCase(),
                status: 'active',
                credentials: encryptRecord(channelInfo.config.channelConfig),
                llmConfig: {
                  ...channelInfo.config.llmConfig,
                  apiKey: encrypt(channelInfo.config.llmConfig.apiKey),
                },
              });
            }

            // Create additional ClientAgent
            this.logger.log(
              `Hiring additional agent "${additionalHiring.agentName}" for client "${result.client._id}"...`,
            );
            const additionalClientAgent = await this.clientAgentRepository.create({
              clientId: result.client._id,
              agentId: additionalAgent._id.toString(),
              price: additionalHiring.price,
              status: 'active',
              channels: additionalChannels,
            });

            this.logger.log(
              `  - Additional ClientAgent: ${additionalClientAgent._id}`,
            );
          }
        }
      }

      this.logger.log('Seeding complete!');
    } catch (error) {
      this.logger.error('Seeding failed', error);
    }
  }
}
