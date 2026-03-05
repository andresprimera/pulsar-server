import { Controller, Get, Put, Patch, Body, Param } from '@nestjs/common';
import { ChannelPricesService } from './channel-prices.service';
import { UpsertChannelPriceDto } from './dto/upsert-channel-price.dto';

@Controller('channels/:channelId/prices')
export class ChannelPricesController {
  constructor(private readonly channelPricesService: ChannelPricesService) {}

  @Put(':currency')
  upsert(
    @Param('channelId') channelId: string,
    @Param('currency') currency: string,
    @Body() dto: UpsertChannelPriceDto,
  ) {
    return this.channelPricesService.upsert(channelId, currency, dto);
  }

  @Get()
  findByChannel(@Param('channelId') channelId: string) {
    return this.channelPricesService.findByChannel(channelId);
  }

  @Patch(':currency/deprecate')
  deprecate(
    @Param('channelId') channelId: string,
    @Param('currency') currency: string,
  ) {
    return this.channelPricesService.deprecate(channelId, currency);
  }
}
