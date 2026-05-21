/**
 * Wire response for `POST /inbox/conversations/:conversationId/read`
 * and `POST /inbox/conversations/:conversationId/unread`.
 *
 * Single shape for both endpoints; the `unread` field flips. The
 * `lastReadAt` field is the timestamp the operator's read state was
 * advanced to (read), or `null` (unread → no read record exists).
 */
export class MarkReadResponseDto {
  conversationId!: string;
  unread!: boolean;
  /**
   * `null` means "no read record exists" — i.e. the operator either
   * hasn't read this conversation at all or just marked it unread
   * (deleting the row). On read, this is the `now` timestamp the row
   * was upserted with.
   */
  lastReadAt!: Date | null;
}
