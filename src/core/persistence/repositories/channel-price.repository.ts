import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChannelPrice } from '@persistence/schemas/channel-price.schema';

@Injectable()
export class ChannelPriceRepository {
  constructor(
    @InjectModel(ChannelPrice.name)
    private readonly model: Model<ChannelPrice>,
  ) {}

  async findActiveByChannelAndCurrency(
    channelId: Types.ObjectId,
    currency: string,
  ): Promise<ChannelPrice | null> {
    const normalized = currency.trim().toUpperCase();
    return this.model
      .findOne({
        channelId,
        currency: normalized,
        status: 'active',
      })
      .exec();
  }

  async upsert(
    channelId: Types.ObjectId,
    currency: string,
    amount: number,
  ): Promise<ChannelPrice> {
    const normalized = currency.trim().toUpperCase();
    const existing = await this.model
      .findOne({ channelId, currency: normalized })
      .exec();
    if (existing) {
      const updated = await this.model
        .findByIdAndUpdate(
          existing._id,
          { amount, status: 'active' },
          { new: true },
        )
        .exec();
      if (!updated) throw new Error('Channel price update failed');
      return updated;
    }
    const [doc] = await this.model.create([
      { channelId, currency: normalized, amount, status: 'active' },
    ]);
    return doc;
  }

  async deprecate(
    channelId: Types.ObjectId,
    currency: string,
  ): Promise<ChannelPrice | null> {
    const normalized = currency.trim().toUpperCase();
    return this.model
      .findOneAndUpdate(
        { channelId, currency: normalized },
        { status: 'deprecated' },
        { new: true },
      )
      .exec();
  }

  async findByChannel(channelId: Types.ObjectId): Promise<ChannelPrice[]> {
    return this.model.find({ channelId }).sort({ currency: 1 }).exec();
  }

  async findByChannelIds(
    channelIds: Types.ObjectId[],
  ): Promise<ChannelPrice[]> {
    if (channelIds.length === 0) return [];
    return this.model
      .find({ channelId: { $in: channelIds } })
      .sort({ currency: 1 })
      .exec();
  }
}
