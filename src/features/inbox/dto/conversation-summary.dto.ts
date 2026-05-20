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
}
