import type { ClientSession, Types } from 'mongoose';

export const INBOX_CONVERSATION_WRITE_PORT = Symbol(
  'INBOX_CONVERSATION_WRITE_PORT',
);

export interface InboxConversationWritePort {
  /**
   * Updates lastMessageAt and (when provided) lastMessagePreview atomically.
   *
   * Callers MUST NOT invoke this method **from the incoming-message
   * orchestrator's human-mode skip branch** — orchestrator is the single
   * inbound suppression gate.
   *
   * Operator-driven outbound writes from `features/inbox/` are a legitimate
   * caller and DO advance these fields, by design — on BOTH successful and
   * failed downstream channel dispatch. The conversation list bubbles up
   * either way; operators open the thread to see the persisted attempt and
   * its `deliveryStatus`.
   */
  updateLastMessageAt(
    conversationId: Types.ObjectId,
    lastMessageAt: Date,
    lastMessagePreview?: string,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * Idempotent setter for denormalized inbox-list enrichment columns.
   * Used by the backfill migration and any future repair tooling.
   */
  setEnrichmentFields(
    conversationId: Types.ObjectId,
    fields: {
      clientAgentId?: Types.ObjectId;
      contactNameLower?: string;
      lastMessagePreview?: string;
    },
  ): Promise<void>;
}
