import { ConversationSummaryDto } from './conversation-summary.dto';

export class ListConversationsResponseDto {
  items!: ConversationSummaryDto[];
  /** Opaque base64 cursor. `null` means no more pages. */
  nextCursor!: string | null;
}
