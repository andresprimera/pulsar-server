import { InboxMessageDto } from './inbox-message.dto';

export class ListMessagesResponseDto {
  items!: InboxMessageDto[];
  /** Opaque base64 cursor. `null` means no more pages. */
  nextCursor!: string | null;
  conversationId!: string;
}
