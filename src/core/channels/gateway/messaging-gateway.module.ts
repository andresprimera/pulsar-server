import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ChannelRouter } from '@channels/channel-router';
import { WhatsappModule } from '@channels/whatsapp/whatsapp.module';
import { TelegramModule } from '@channels/telegram/telegram.module';
import { InstagramModule } from '@channels/instagram/instagram.module';
import { TiktokModule } from '@channels/tiktok/tiktok.module';
import { ChannelConfigModule } from '@channels/config/channel-config.module';
import { MessagingGatewayService } from './messaging-gateway.service';

/**
 * Wires the four `ChannelAdapter` implementations into the
 * `DiscoveryService` provider tree so `ChannelRouter.onModuleInit` finds
 * them on bootstrap. The `@ChannelAdapterProvider()` decorator on each
 * channel service does the actual discovery via metadata; this module
 * just needs to import each channel module so its providers register.
 */
@Module({
  imports: [
    DiscoveryModule,
    ChannelConfigModule,
    WhatsappModule,
    TelegramModule,
    InstagramModule,
    TiktokModule,
  ],
  providers: [ChannelRouter, MessagingGatewayService],
  exports: [MessagingGatewayService],
})
export class MessagingGatewayModule {}
