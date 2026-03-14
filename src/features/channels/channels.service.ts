import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import {
  EMPTY_PRICES,
  toPlain,
  buildActivePricesMap,
} from '@core/utils/catalog-pricing.util';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly channelRepository: ChannelRepository,
    private readonly channelPriceRepository: ChannelPriceRepository,
  ) {}

  async findAll() {
    const channels = await this.channelRepository.findAll();
    const channelIds = channels.map((c) => c._id as Types.ObjectId);
    const priceMap = await this.buildActivePricesMapByChannelIds(channelIds);
    return channels.map((channel) => {
      const plain = toPlain(channel);
      return {
        ...plain,
        prices: priceMap.get(String(channel._id)) ?? EMPTY_PRICES,
      };
    });
  }

  async findOne(id: string) {
    const channel = await this.channelRepository.findById(id);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    const priceMap = await this.buildActivePricesMapByChannelIds([
      channel._id as Types.ObjectId,
    ]);
    const plain = toPlain(channel);
    return {
      ...plain,
      prices: priceMap.get(String(channel._id)) ?? EMPTY_PRICES,
    };
  }

  private async buildActivePricesMapByChannelIds(
    channelIds: Types.ObjectId[],
  ): Promise<Map<string, { currency: string; amount: number }[]>> {
    if (channelIds.length === 0) {
      return new Map();
    }
    const prices = await this.channelPriceRepository.findByChannelIds(
      channelIds,
    );
    return buildActivePricesMap(
      prices,
      (p) => String(p.channelId),
      (p) => p.currency,
      (p) => p.amount,
      (p) => p.status,
    );
  }
}
