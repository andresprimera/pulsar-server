import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';

@Injectable()
export class ClientAgentRepository {
  constructor(
    @InjectModel(ClientAgent.name)
    private readonly model: Model<ClientAgent>,
  ) {}

  async findById(id: string): Promise<ClientAgent | null> {
    return this.model.findById(id).exec();
  }

  async findAll(): Promise<ClientAgent[]> {
    return this.model.find().exec();
  }

  async create(
    data: Partial<ClientAgent>,
    session?: ClientSession,
  ): Promise<ClientAgent> {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /**
   * Find all ClientAgents for a given client.
   * Note: `credentials` and `apiKey` are excluded by default (select: false).
   * This is intentional — use `select('+channels.credentials')` only
   * in routing queries that need to decrypt credentials.
   */
  async findByClient(clientId: string): Promise<ClientAgent[]> {
    return this.model.find({ clientId }).exec();
  }

  async findByClientAndAgent(
    clientId: string,
    agentId: string,
  ): Promise<ClientAgent | null> {
    return this.model.findOne({ clientId, agentId }).exec();
  }

  async findByClientAndStatus(
    clientId: string,
    status: 'active' | 'inactive' | 'archived',
  ): Promise<ClientAgent[]> {
    return this.model.find({ clientId, status }).exec();
  }

  async update(
    id: string,
    data: Partial<ClientAgent>,
  ): Promise<ClientAgent | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  /**
   * Find ClientAgent by WhatsApp phoneNumberId within embedded channels.
   * Checks for active status and matching credentials.
   */
  async findOneByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<ClientAgent | null> {
    const matches = await this.findActiveByPhoneNumberId(phoneNumberId);
    return matches[0] ?? null;
  }

  /**
   * Find all active ClientAgents by WhatsApp phoneNumberId within embedded channels.
   */
  async findActiveByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            phoneNumberId,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }

  /**
   * Find ClientAgent by TikTok user ID within embedded channels.
   * Checks for active status and matching tiktokUserId.
   */
  async findOneByTiktokUserId(
    tiktokUserId: string,
  ): Promise<ClientAgent | null> {
    const matches = await this.findActiveByTiktokUserId(tiktokUserId);
    return matches[0] ?? null;
  }

  /**
   * Find all active ClientAgents by TikTok user ID within embedded channels.
   */
  async findActiveByTiktokUserId(tiktokUserId: string): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            tiktokUserId,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }

  /**
   * Find ClientAgent by Instagram account ID within embedded channels.
   * Checks for active status and matching instagramAccountId.
   */
  async findOneByInstagramAccountId(
    instagramAccountId: string,
  ): Promise<ClientAgent | null> {
    const matches = await this.findActiveByInstagramAccountId(
      instagramAccountId,
    );
    return matches[0] ?? null;
  }

  /**
   * Find all active ClientAgents by Instagram account ID within embedded channels.
   */
  async findActiveByInstagramAccountId(
    instagramAccountId: string,
  ): Promise<ClientAgent[]> {
    return this.model
      .find({
        status: 'active',
        channels: {
          $elemMatch: {
            status: 'active',
            instagramAccountId,
          },
        },
      })
      .select('+channels.credentials +channels.llmConfig.apiKey')
      .exec();
  }
}
