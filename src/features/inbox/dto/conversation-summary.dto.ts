import type { ControlMode } from '@shared/inbox/control-mode';

/**
 * Wire shape for a single inbox conversation row.
 *
 * Note on `lastMessageAt`: this timestamp does NOT advance for inbound
 * messages received while a conversation is in `'human'` control mode
 * (the orchestrator skips `conversationService.touch` on the suppression
 * path). Operators relying on order-by-recency see human-mode threads
 * pinned to their last bot-handled activity until Phase 2 ships
 * operator-side outbound writes.
 *
 * `lastMessagePreview` inherits the same suppression contract: it is
 * frozen while `controlMode === 'human'`.
 *
 * `assignedOperatorName`, `unreadCount`, and `tags` are Phase-1
 * placeholders. They currently project the inert defaults `null`, `0`,
 * and `[]` respectively. Phase-2+ will populate them from operator
 * assignment and unread-tracking surfaces.
 *
 * `clientAgentId` (the denormalized join key behind `agentId` filtering
 * and the AI-agent join) is intentionally not on the wire — the
 * resolved `assistant` name is what operators see.
 */
export class ConversationSummaryDto {
  _id!: string;
  contactId!: string;
  channelId!: string;
  status!: 'open' | 'closed' | 'archived';
  controlMode!: ControlMode;
  lastMessageAt!: Date;
  summary?: string;
  createdAt!: Date;
  updatedAt!: Date;

  contactName!: string;
  contactEmail!: string | null;
  provider!: string;
  channelHandle!: string;
  assistant!: string | null;
  assignedOperatorName!: string | null;
  lastMessagePreview!: string;
  unreadCount!: number;
  tags!: string[];
}
