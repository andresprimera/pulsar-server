import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { RegisterAndHireDto } from './dto/register-and-hire.dto';
import { ClientRepository } from '../database/repositories/client.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { AgentRepository } from '../database/repositories/agent.repository';
import { ChannelRepository } from '../database/repositories/channel.repository';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';

import { ClientPhoneRepository } from '../database/repositories/client-phone.repository';

export interface RegisterAndHireResult {
  user: {
    _id: string;
    email: string;
    name: string;
    clientId: string;
    status: string;
  };
  client: {
    _id: string;
    type: string;
    name: string;
    ownerUserId: string;
    status: string;
  };
  clientAgent: {
    _id: string;
    clientId: string;
    agentId: string;
    price: number;
    status: string;
  };
  agentChannels: Array<{
    _id: string;
    clientId: string;
    agentId: string;
    channelId: string;
    status: string;
    channelConfig: Record<string, any>;
    llmConfig: {
      provider: string;
      model: string;
    };
  }>;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clientRepository: ClientRepository,
    private readonly userRepository: UserRepository,
    private readonly agentRepository: AgentRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly clientAgentRepository: ClientAgentRepository,

    private readonly clientPhoneRepository: ClientPhoneRepository,
  ) {}

  async registerAndHire(dto: RegisterAndHireDto): Promise<RegisterAndHireResult> {
    // PRE-TRANSACTION VALIDATIONS (fail fast, no rollback needed)

    // 1. Normalize email
    const normalizedEmail = dto.user.email.toLowerCase().trim();

    // 2. Check user email doesn't exist
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // 3. Validate agent is hireable
    await this.agentRepository.validateHireable(dto.agentHiring.agentId);

    // 4. Validate client name for organization type
    if (dto.client.type === 'organization' && !dto.client.name) {
      throw new BadRequestException('Client name is required for organization type');
    }

    // 5. Channels are validated during processing below

    // TRANSACTION (atomic writes)
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 6. Create Client
      const clientName = dto.client.name || dto.user.name;
      const client = await this.clientRepository.create(
        {
          name: clientName,
          type: dto.client.type,
          status: 'active',
        },
        session,
      );

      // 7. Create User
      const user = await this.userRepository.create(
        {
          email: normalizedEmail,
          name: dto.user.name,
          clientId: client._id as Types.ObjectId,
          status: 'active',
        },
        session,
      );

      // 8. Update Client with ownerUserId
      await this.clientRepository.update(
        (client._id as Types.ObjectId).toString(),
        { ownerUserId: user._id as Types.ObjectId },
        session,
      );

      // 10. Process Channels
      const hireChannels = [];
      const processedChannelIds = new Set<string>();

      for (const channelConfig of dto.channels) {
        // Validation: Unique channelId in request
        if (processedChannelIds.has(channelConfig.channelId)) {
            throw new BadRequestException(`Duplicate channelId in request: ${channelConfig.channelId}`);
        }
        processedChannelIds.add(channelConfig.channelId);

        // Validation: Channel exists (Infrastructure)
        const channel = await this.channelRepository.findByIdOrFail(channelConfig.channelId);

        // Validation: Provider supported
        const normalizedProvider = channelConfig.provider.toLowerCase().trim();
        if (!channel.supportedProviders.includes(normalizedProvider)) {
            throw new BadRequestException(
                `Provider "${channelConfig.provider}" is not supported by channel "${channel.name}". Supported: ${channel.supportedProviders.join(', ')}`
            );
        }

        // Credentials & Phone Logic
        let phoneNumberId: string | undefined;
        if (channelConfig.credentials && 'phoneNumberId' in channelConfig.credentials) {
            phoneNumberId = channelConfig.credentials.phoneNumberId;
        }

        if (phoneNumberId) {
             // Resolve or create ClientPhone for this client
             // Note: We don't store clientPhoneId in ClientAgent (embedded), 
             // but we still enforce ownership via ClientPhone repository
             await this.clientPhoneRepository.resolveOrCreate(
                client._id as Types.ObjectId,
                phoneNumberId,
                {
                    provider: normalizedProvider as any,
                    session,
                },
             );
        }

        hireChannels.push({
            channelId: new Types.ObjectId(channelConfig.channelId),
            provider: normalizedProvider,
            status: 'active',
            credentials: channelConfig.credentials,
            llmConfig: channelConfig.llmConfig,
        });
      }

      // 9. Create ClientAgent (pricing snapshot + channels)
      const clientAgent = await this.clientAgentRepository.create(
        {
          clientId: (client._id as Types.ObjectId).toString(),
          agentId: dto.agentHiring.agentId,
          price: dto.agentHiring.price,
          status: 'active',
          channels: hireChannels,
        },
        session,
      );

      // 12. Commit transaction
      await session.commitTransaction();

      // 14. Return response
      return {
        user: {
          _id: (user._id as Types.ObjectId).toString(),
          email: user.email,
          name: user.name,
          clientId: (user.clientId as Types.ObjectId).toString(),
          status: user.status,
        },
        client: {
          _id: (client._id as Types.ObjectId).toString(),
          type: client.type,
          name: client.name,
          ownerUserId: (user._id as Types.ObjectId).toString(),
          status: client.status,
        },
        clientAgent: {
          _id: (clientAgent._id as Types.ObjectId).toString(),
          clientId: clientAgent.clientId,
          agentId: clientAgent.agentId,
          price: clientAgent.price,
          status: clientAgent.status,
        },
        // We no longer return agentChannels array as they are embedded
        agentChannels: [], 
      };
    } catch (error) {
      // Abort transaction on error (may already be aborted by MongoDB on E11000)
      try {
        await session.abortTransaction();
      } catch {
        // Transaction already aborted (e.g. after E11000 duplicate key)
      }

      // Map MongoDB 11000 (duplicate key) to 409 Conflict
      if (this.isDuplicateKeyError(error)) {
        const field = this.extractDuplicateField(error);
        throw new ConflictException(`Duplicate value for field: ${field}`);
      }

      // Re-throw other errors
      throw error;
    } finally {
      session.endSession();
    }
  }

  private isDuplicateKeyError(error: any): boolean {
    return (
      error?.code === 11000 ||
      (error?.name === 'MongoServerError' && error?.code === 11000)
    );
  }

  private extractDuplicateField(error: any): string {
    const keyPattern = error?.keyPattern;
    if (keyPattern) {
      return Object.keys(keyPattern).join(', ');
    }

    const match = error?.message?.match(/index: (\w+)/);
    return match ? match[1] : 'unknown';
  }
}
