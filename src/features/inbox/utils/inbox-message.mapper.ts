import { Message } from '@persistence/schemas/message.schema';
import { InboxMessageDto } from '@inbox/dto/inbox-message.dto';

/**
 * Shared projection from a persisted `Message` row to the inbox wire
 * shape (`InboxMessageDto`). Consumed by both
 * `InboxService.listConversationMessages` and
 * `InboxOperatorMessageService.sendOperatorMessage` so the wire contract
 * stays single-source.
 *
 * `authorNamesByUserId` is the batched `User._id → name` lookup the
 * caller built for the page. The map is keyed by hex string (the
 * `ObjectId.toString()` of `authorClientUserId`). Missing entries are
 * silently dropped — the wire field becomes `undefined`.
 */
type WireType = 'user' | 'agent' | 'human';
type WireSender = 'contact' | 'assistant' | 'human';

export function toInboxMessageDto(
  message: Message,
  authorNamesByUserId: ReadonlyMap<string, string> = new Map(),
): InboxMessageDto {
  // `senderFromType` throws on any non-wire `Message.type` (today
  // `'summary'`), so once we get past this line both `type` and `sender`
  // are guaranteed to be wire-vocabulary values. No `as` cast required
  // on the DTO assignment below.
  const { type, sender } = wireVocabularyFromType(message.type);

  const authorClientUserId = message.authorClientUserId
    ? String(message.authorClientUserId)
    : undefined;

  const authorName =
    authorClientUserId !== undefined
      ? authorNamesByUserId.get(authorClientUserId)
      : undefined;

  const dto: InboxMessageDto = {
    _id: String(message._id),
    conversationId: String(message.conversationId),
    content: message.content,
    type,
    sender,
    contactId: message.contactId ? String(message.contactId) : null,
    agentId: message.agentId ? String(message.agentId) : null,
    createdAt: message.createdAt as Date,
  };

  if (authorClientUserId !== undefined) {
    dto.authorClientUserId = authorClientUserId;
  }
  if (authorName !== undefined) {
    dto.authorName = authorName;
  }
  if (message.deliveryStatus !== undefined) {
    dto.deliveryStatus = message.deliveryStatus;
  }
  return dto;
}

/**
 * Maps the storage-level `Message.type` to the wire-level `(type,
 * sender)` pair the FE consumes. Total over `Message.type`:
 *
 *   - `'user'`    → `{ type: 'user',  sender: 'contact'   }`
 *   - `'agent'`   → `{ type: 'agent', sender: 'assistant' }`
 *   - `'human'`   → `{ type: 'human', sender: 'human'     }`
 *   - `'summary'` → throws — summary rows are filtered out by
 *                   `MessageRepository.findByConversationPage` and must
 *                   never reach this mapper. A throw here is defensive
 *                   against a future regression that lets one through.
 *
 * Returning both fields together lets the caller drop the previous
 * `as 'user' | 'agent' | 'human'` cast on the DTO assignment.
 */
function wireVocabularyFromType(type: Message['type']): {
  type: WireType;
  sender: WireSender;
} {
  switch (type) {
    case 'user':
      return { type: 'user', sender: 'contact' };
    case 'agent':
      return { type: 'agent', sender: 'assistant' };
    case 'human':
      return { type: 'human', sender: 'human' };
    default:
      // `'summary'` is the only remaining branch today; future enum
      // additions must update both this switch and the inbox-read
      // repository filter.
      throw new Error(
        `inbox-message.mapper: unsupported Message.type='${String(
          type,
        )}' reached the inbox wire mapper (summary rows must be filtered upstream)`,
      );
  }
}
