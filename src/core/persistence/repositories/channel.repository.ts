import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Channel } from '@persistence/schemas/channel.schema';

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

  /**
   * Phase 5 — batched `_id` lookup used by the inbox `/channels` and
   * `/contacts` endpoints to project a `Channel`'s human-readable
   * `name` and canonical `type` (the wire `provider`). Returns only the
   * safe projection `(_id, name, type)`; covered by the default
   * `_id_` index. Missing references are handled by the caller (omit
   * from the rendered list).
   */
  async findByIds(
    ids: Types.ObjectId[],
  ): Promise<Pick<Channel, '_id' | 'name' | 'type'>[]> {
    if (ids.length === 0) {
      return [];
    }
    return (await this.model
      .find({ _id: { $in: ids } }, { _id: 1, name: 1, type: 1 })
      .lean()
      .exec()) as unknown as Pick<Channel, '_id' | 'name' | 'type'>[];
  }
}
