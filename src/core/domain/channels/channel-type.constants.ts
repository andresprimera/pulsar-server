import { ChannelType } from './channel-type.type';

export const CHANNEL_TYPES = {
  WHATSAPP: 'whatsapp',
  TELEGRAM: 'telegram',
  WEB: 'web',
  API: 'api',
  TIKTOK: 'tiktok',
  INSTAGRAM: 'instagram',
} as const satisfies Record<string, ChannelType>;
