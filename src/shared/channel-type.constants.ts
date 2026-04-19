/**
 * Canonical channel kind identifiers for persistence (Channel.type) and APIs.
 * Add new kinds here first, then extend CHANNEL_CATALOG and transport modules.
 */
export const CHANNEL_TYPES = [
  'whatsapp',
  'telegram',
  'web',
  'api',
  'tiktok',
  'instagram',
] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];
