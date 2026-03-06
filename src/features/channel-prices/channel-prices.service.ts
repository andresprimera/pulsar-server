import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { UpsertChannelPriceDto } from './dto/upsert-channel-price.dto';

const CURRENCY_REGEX = /^[A-Z]{3}$/;

@Injectable()
export class ChannelPricesService {
  constructor(
    private readonly channelPriceRepository: ChannelPriceRepository,
    private readonly channelRepository: ChannelRepository,
  ) {}

  private validateCurrency(currency: string): string {
    const normalized = currency.toUpperCase();
    if (!CURRENCY_REGEX.test(normalized)) {
      throw new BadRequestException(
        'Currency must be a valid ISO 4217 code (e.g. USD, EUR, BRL)',
      );
    }
    return normalized;
  }

  async upsert(
    channelId: string,
    currency: string,
    dto: UpsertChannelPriceDto,
  ) {
    await this.channelRepository.findByIdOrFail(channelId);
    const normalized = this.validateCurrency(currency);
    return this.channelPriceRepository.upsert(
      new Types.ObjectId(channelId),
      normalized,
      dto.amount,
    );
  }

  async findByChannel(channelId: string) {
    await this.channelRepository.findByIdOrFail(channelId);
    return this.channelPriceRepository.findByChannel(
      new Types.ObjectId(channelId),
    );
  }

  async deprecate(channelId: string, currency: string) {
    await this.channelRepository.findByIdOrFail(channelId);
    const normalized = this.validateCurrency(currency);
    const updated = await this.channelPriceRepository.deprecate(
      new Types.ObjectId(channelId),
      normalized,
    );
    if (!updated) {
      throw new NotFoundException(
        `No price found for channel ${channelId} in currency ${normalized}`,
      );
    }
    return updated;
  }
}
