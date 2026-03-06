import { Module } from '@nestjs/common';
import { ChannelPricesController } from './channel-prices.controller';
import { ChannelPricesService } from './channel-prices.service';

@Module({
  controllers: [ChannelPricesController],
  providers: [ChannelPricesService],
  exports: [ChannelPricesService],
})
export class ChannelPricesModule {}
