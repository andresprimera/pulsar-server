import { ChannelCatalogSeederService } from './channel-catalog-seeder.service';
import { CHANNEL_CATALOG } from './channel-catalog';

describe('ChannelCatalogSeederService', () => {
  it('upserts every catalog entry on application bootstrap', async () => {
    const upsertCatalogEntry = jest.fn().mockResolvedValue({});
    const channelRepository = { upsertCatalogEntry };
    const service = new ChannelCatalogSeederService(channelRepository as any);

    await service.onApplicationBootstrap();

    expect(upsertCatalogEntry).toHaveBeenCalledTimes(CHANNEL_CATALOG.length);
    for (const entry of CHANNEL_CATALOG) {
      expect(upsertCatalogEntry).toHaveBeenCalledWith(entry);
    }
  });
});
