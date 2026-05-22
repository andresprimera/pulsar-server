import { LeadSummaryDto } from './lead-summary.dto';

/**
 * Paginated wrapper around {@link LeadSummaryDto}. Mirrors the cursor-shape
 * pattern used by the inbox feature (`ListConversationsResponseDto`):
 * `nextCursor` is `null` when there is no further page, otherwise an
 * opaque base64 cursor string.
 */
export class PaginatedLeadSummaryDto {
  items!: LeadSummaryDto[];
  /** Opaque base64 cursor. `null` means no more pages. */
  nextCursor!: string | null;
}
