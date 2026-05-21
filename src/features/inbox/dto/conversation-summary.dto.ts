import type { ControlMode } from '@shared/inbox/control-mode';

/**
 * Wire shape for a single inbox conversation row.
 *
 * Note on `lastMessageAt`: this timestamp does NOT advance for inbound
 * messages received while a conversation is in `'human'` control mode
 * (the orchestrator skips `conversationService.touch` on the suppression
 * path). Phase 2 unfreezes this on operator-driven outbound writes from
 * `features/inbox/`: the timestamp ADVANCES when an operator submits a
 * reply via `POST /inbox/conversations/:id/messages`, regardless of
 * whether the downstream channel dispatch succeeds or fails. The
 * conversation list bubbles up either way so operators see the activity;
 * the failed attempt is visible inside the thread itself, not on the
 * list row.
 *
 * `lastMessagePreview` follows the same contract: frozen for inbound
 * messages while `controlMode === 'human'`, but ADVANCES on operator
 * outbound writes (success and failure).
 *
 * The DTO does NOT surface `deliveryStatus` directly. Operators open the
 * thread to see whether an outbound row landed as `'sent'` or `'failed'`;
 * the conversation list only reflects activity timing and preview text.
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
