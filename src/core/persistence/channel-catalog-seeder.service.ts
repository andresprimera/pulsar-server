import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ChannelRepository } from './repositories/channel.repository';
import { CHANNEL_CATALOG } from './channel-catalog';

@Injectable()
export class ChannelCatalogSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChannelCatalogSeederService.name);

  constructor(private readonly channelRepository: ChannelRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    const started = Date.now();
    for (const entry of CHANNEL_CATALOG) {
      await this.channelRepository.upsertCatalogEntry(entry);
    }
    this.logger.log(
      `Channel catalog synced count=${CHANNEL_CATALOG.length} durationMs=${
        Date.now() - started
      }`,
    );
  }
}
