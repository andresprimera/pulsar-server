import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChannelEnvService } from './channel-env.service';

/**
 * Validates at startup that env credential sets are complete when partially set.
 * If any env var for a channel/provider is set, all required vars for that set must be set.
 * Prevents runtime send failures due to partial .env configuration.
 */
@Injectable()
export class ChannelEnvValidator implements OnModuleInit {
  constructor(private readonly channelEnvService: ChannelEnvService) {}

  onModuleInit(): void {
    this.validate();
  }

  private validate(): void {
    if (this.channelEnvService.hasAnyWhatsAppMetaEnv()) {
      const creds = this.channelEnvService.getWhatsAppMetaCredentials();
      if (!creds) {
        throw new Error(
          'Channel env configuration error: Set WHATSAPP_META_ACCESS_TOKEN in .env, or leave unset.',
        );
      }
    }

    if (this.channelEnvService.hasAnyWhatsApp360Env()) {
      const creds = this.channelEnvService.getWhatsApp360Credentials();
      if (!creds) {
        throw new Error(
          'Channel env configuration error: Set WHATSAPP_DIALOG360_API_KEY in .env, or leave unset.',
        );
      }
    }

    if (this.channelEnvService.hasAnyInstagramEnv()) {
      const creds = this.channelEnvService.getInstagramCredentials();
      if (!creds) {
        throw new Error(
          'Channel env configuration error: Set INSTAGRAM_ACCESS_TOKEN in .env, or leave unset.',
        );
      }
    }

    if (this.channelEnvService.hasAnyTikTokEnv()) {
      const creds = this.channelEnvService.getTikTokCredentials();
      if (!creds) {
        throw new Error(
          'Channel env configuration error: Set TIKTOK_ACCESS_TOKEN in .env, or leave unset.',
        );
      }
    }
  }
}
