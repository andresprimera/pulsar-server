import { Injectable, Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ChannelProviderValue } from '@shared/channel-provider.constants';
import { WhatsAppProviderAdapter } from './providers/whatsapp-provider.interface';
import { MetaWhatsAppAdapter } from './providers/meta.adapter';
import { Dialog360WhatsAppAdapter } from './providers/dialog360.adapter';

@Injectable()
export class WhatsAppProviderRouter {
  private readonly logger = new Logger(WhatsAppProviderRouter.name);
  private readonly adapters: Map<string, WhatsAppProviderAdapter>;

  constructor(
    private readonly metaAdapter: MetaWhatsAppAdapter,
    private readonly dialog360Adapter: Dialog360WhatsAppAdapter,
  ) {
    this.adapters = new Map<string, WhatsAppProviderAdapter>([
      [ChannelProvider.Meta, this.metaAdapter],
      [ChannelProvider.Dialog360, this.dialog360Adapter],
    ]);
  }

  resolve(provider?: ChannelProviderValue): WhatsAppProviderAdapter {
    if (!provider) {
      return this.metaAdapter;
    }

    const adapter = this.adapters.get(provider);
    if (!adapter) {
      this.logger.warn(
        `No adapter registered for provider="${provider}", falling back to Meta.`,
      );
      return this.metaAdapter;
    }

    return adapter;
  }

  hasAdapter(provider: string): boolean {
    return this.adapters.has(provider);
  }
}
