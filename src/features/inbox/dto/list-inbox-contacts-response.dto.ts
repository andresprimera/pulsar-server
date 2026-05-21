/**
 * Phase 5 — wire shape for `GET /inbox/contacts`.
 *
 * Each item represents one tenant `Contact` enriched with the joined
 * `Channel.type` (as `provider`) and the count of conversations the
 * contact owns across all statuses. `email` is sourced from
 * `Contact.identifier.value` ONLY when `identifier.type === 'email'`;
 * otherwise it is `null`. `provider` falls back to the literal string
 * `'unknown'` when the joined `Channel` is missing (e.g. catalog row
 * deleted) — the wire type is `provider: string`, never `null`.
 * `lastSeen` projects `Contact.updatedAt`.
 *
 * Pagination is cursor-based on `(updatedAt DESC, _id DESC)` using the
 * Phase 1 cursor codec.
 */
export class InboxContactDto {
  id!: string;
  name!: string;
  email!: string | null;
  provider!: string;
  conversationCount!: number;
  lastSeen!: Date;
}

export class ListInboxContactsResponseDto {
  items!: InboxContactDto[];
  /** Opaque base64 cursor. `null` means no more pages. */
  nextCursor!: string | null;
}
