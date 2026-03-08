import { SetMetadata } from '@nestjs/common';

export const CHANNEL_ADAPTER_METADATA = 'CHANNEL_ADAPTER';

export const ChannelAdapterProvider = () =>
  SetMetadata(CHANNEL_ADAPTER_METADATA, true);
