import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Phase 5 — query DTO for `GET /inbox/contacts`.
 *
 * `cursor` is the opaque base64 cursor produced by the response's
 * `nextCursor` field; decoded via `decodeCursor` from
 * `src/features/inbox/utils/cursor.util.ts`. `limit` is bounded
 * `[1, 100]`; the service applies the default of 50 when unset (the
 * architect-locked Phase 5 contract).
 *
 * Per the iter-2 plan, `q` is deferred to Phase 6+ and intentionally
 * does NOT appear on this DTO. Shipping `q` cleanly requires the
 * Phase-1 denormalize-then-backfill pattern (mirror of
 * `Conversation.contactNameLower`).
 */
export class ListInboxContactsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
