import type { ClientSession, Types } from 'mongoose';

export const INBOX_CONVERSATION_WRITE_PORT = Symbol(
  'INBOX_CONVERSATION_WRITE_PORT',
);

export interface InboxConversationWritePort {
  /**
   * Updates lastMessageAt and (when provided) lastMessagePreview atomically.
   * Callers MUST NOT invoke this method on the orchestrator's human-mode skip path;
   * orchestrator is the single suppression gate.
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
