import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ChannelRouter } from '@channels/channel-router';
import { WhatsappModule } from '@channels/whatsapp/whatsapp.module';
import { MessagingGatewayService } from './messaging-gateway.service';

@Module({
  imports: [DiscoveryModule, WhatsappModule],
  providers: [ChannelRouter, MessagingGatewayService],
  exports: [MessagingGatewayService],
})
export class MessagingGatewayModule {}
