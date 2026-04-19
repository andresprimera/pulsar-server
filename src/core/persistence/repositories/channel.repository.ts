import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Channel } from '@persistence/schemas/channel.schema';
import type { ChannelCatalogEntry } from '@persistence/channel-catalog';

@Injectable()
export class ChannelRepository {
  constructor(
    @InjectModel(Channel.name)
    private readonly model: Model<Channel>,
  ) {}

  async findById(id: string): Promise<Channel | null> {
    return this.model.findById(id).exec();
  }

  async findByNameOrFail(name: string): Promise<Channel> {
    const channel = await this.model.findOne({ name }).exec();
    if (!channel) {
      throw new NotFoundException(`Channel with name "${name}" not found`);
    }
    return channel;
  }

  async findOrCreateByName(
    name: string,
    data?: Partial<Channel>,
    session?: ClientSession,
  ): Promise<Channel> {
    return this.model
      .findOneAndUpdate(
        { name },
        { $setOnInsert: { ...data, name } },
        { upsert: true, new: true, ...(session && { session }) },
      )
      .exec();
  }

  /**
   * Materializes code-owned fields; preserves DB-tuned fields after insert
   * (monthlyMessageQuota is only set on insert).
   */
  async upsertCatalogEntry(entry: ChannelCatalogEntry): Promise<Channel> {
    const supportedProviders = entry.supportedProviders.map((p) =>
      p.toLowerCase(),
    );
    const monthlyMessageQuotaOnInsert =
      entry.defaultMonthlyMessageQuota !== undefined
        ? entry.defaultMonthlyMessageQuota
        : null;

    return this.model
      .findOneAndUpdate(
        { name: entry.name },
        {
          $set: {
            type: entry.type,
            supportedProviders,
          },
          $setOnInsert: {
            name: entry.name,
            monthlyMessageQuota: monthlyMessageQuotaOnInsert,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async findAll(): Promise<Channel[]> {
    return this.model.find().exec();
  }
  async create(data: Partial<Channel>): Promise<Channel> {
    const channel = new this.model(data);
    return channel.save();
  }

  async findByIdOrFail(id: string | Types.ObjectId): Promise<Channel> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
    const doc = await this.model.findById(objectId).exec();
    if (!doc) {
      throw new NotFoundException(`Channel not found with id: ${id}`);
    }
    return doc;
  }
}
