import { EnrichedInboxRow } from '@persistence/repositories/conversation.repository';
import { ControlMode, DEFAULT_CONTROL_MODE } from '@shared/inbox/control-mode';
import { ConversationSummaryDto } from '@inbox/dto/conversation-summary.dto';

/**
 * Single source of truth for the `EnrichedInboxRow → ConversationSummaryDto`
 * mapping. Used by both the list endpoint (`InboxService.listConversations`)
 * and the Phase-3 mutation endpoints (`InboxConversationMutationService`)
 * so the wire shape stays consistent across reads and writes.
 *
 * Mirrors the Phase-2 `inbox-message.mapper.ts` extraction pattern.
 */
export function toConversationSummary(
  row: EnrichedInboxRow,
): ConversationSummaryDto {
  const contactName = row.contact?.name ?? '';
  const contactEmail =
    row.contact?.identifier?.type === 'email'
      ? row.contact.identifier.value
      : null;
  const provider = (row.channel?.type ?? '').toLowerCase();
  const channelHandle = resolveChannelHandle(row);
  const assistant = row.agent?.name ?? null;

  return {
    _id: String(row._id),
    contactId: String(row.contactId),
    channelId: String(row.channelId),
    status: row.status,
    controlMode: (row.controlMode ?? DEFAULT_CONTROL_MODE) as ControlMode,
    lastMessageAt: row.lastMessageAt,
    summary: row.summary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contactName,
    contactEmail,
    provider,
    channelHandle,
    assistant,
    assignedOperatorName: row.assignedOperator?.name ?? null,
    lastMessagePreview: row.lastMessagePreview ?? '',
    unreadCount: row.unread ? 1 : 0,
    tags: row.tags ?? [],
  };
}

function resolveChannelHandle(row: EnrichedInboxRow): string {
  const hireChannels = row.clientAgent?.channels ?? [];
  const matching = hireChannels.find(
    (c) => c.channelId && String(c.channelId) === String(row.channelId),
  );
  if (!matching) return '';
  return (
    matching.phoneNumberId ??
    matching.instagramAccountId ??
    matching.tiktokUserId ??
    matching.telegramBotId ??
    ''
  );
}
