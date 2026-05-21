/**
 * Wire shape for a single message in an inbox thread.
 *
 * `type` is the storage discriminator — Phase 2 widens it to include
 * `'human'` for operator-authored outbound rows. `sender` is the
 * FE-friendly alias computed from `type` at the mapper level
 * (`'user' → 'contact'`, `'agent' → 'assistant'`, `'human' → 'human'`).
 * Both are surfaced so FE code that still reads `type` keeps working
 * while new code targets `sender`.
 *
 * `authorName`, `authorClientUserId`, and `deliveryStatus` are populated
 * only for operator-authored rows. `authorName` is resolved at read time
 * via a batched `User._id → name` join (no denormalization).
 */
export class InboxMessageDto {
  _id!: string;
  conversationId!: string;
  content!: string;
  type!: 'user' | 'agent' | 'human';
  sender!: 'contact' | 'assistant' | 'human';
  authorName?: string;
  contactId!: string | null;
  agentId!: string | null;
  authorClientUserId?: string;
  deliveryStatus?: 'pending' | 'sent' | 'failed';
  createdAt!: Date;
}
