/**
 * Channel provider values for persistence/schema use.
 * Kept in shared so persistence does not depend on domain.
 * Domain and features may use @domain/channels/channel-provider.enum for typing.
 */
export const CHANNEL_PROVIDER_VALUES = [
  'meta',
  'twilio',
  'tiktok',
  'instagram',
  'telegram',
  'dialog360',
] as const;

export type ChannelProviderValue = (typeof CHANNEL_PROVIDER_VALUES)[number];
