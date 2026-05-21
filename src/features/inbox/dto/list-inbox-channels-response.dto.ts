/**
 * Phase 5 — wire shape for `GET /inbox/channels`.
 *
 * Each item represents a channel currently hired by the caller's tenant,
 * deduped across hires by `channelId` and joined with the global
 * `Channel` collection for the human-readable `label`. `provider` is the
 * `Channel.type` enum value (lowercase) — NOT `HireChannelConfig.provider`
 * (the integration provider). `status` is `'active'` when ANY hire's
 * binding on this channel is active, otherwise `'inactive'`.
 *
 * No pagination (channels are a tiny per-tenant set — typically ≤ 6, one
 * per provider).
 */
export class InboxChannelDto {
  id!: string;
  provider!: string;
  label!: string;
  status!: 'active' | 'inactive';
}

export class ListInboxChannelsResponseDto {
  items!: InboxChannelDto[];
}
