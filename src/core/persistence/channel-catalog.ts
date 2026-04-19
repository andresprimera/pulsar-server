import type { ChannelType } from '@shared/channel-type.constants';

/**
 * Code-owned catalog rows materialized into Mongo on every API bootstrap.
 * DB holds ids, FKs, and admin-tunable fields (e.g. monthlyMessageQuota) after insert.
 */
export type ChannelCatalogEntry = {
  readonly name: string;
  readonly type: ChannelType;
  readonly supportedProviders: readonly string[];
  /** Applied on insert only; omitted or null means unlimited quota. */
  readonly defaultMonthlyMessageQuota?: number | null;
};

/**
 * Types backed by inbound transport modules imported in AppModule.
 * Architecture tests require CHANNEL_CATALOG to cover each of these.
 */
export const TRANSPORT_IMPLEMENTED_CHANNEL_TYPES = [
  'whatsapp',
  'tiktok',
  'instagram',
] as const satisfies readonly ChannelType[];

export const CHANNEL_CATALOG: readonly ChannelCatalogEntry[] = [
  {
    name: 'WhatsApp',
    type: 'whatsapp',
    supportedProviders: ['meta', 'twilio', 'dialog360'],
  },
  {
    name: 'TikTok',
    type: 'tiktok',
    supportedProviders: ['tiktok'],
  },
  {
    name: 'Instagram',
    type: 'instagram',
    supportedProviders: ['instagram'],
  },
];
