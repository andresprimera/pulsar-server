import { IsIn } from 'class-validator';

/**
 * Body shape for `PATCH /inbox/conversations/:conversationId/status`.
 *
 * The three allowed values mirror `Conversation.status`. The endpoint is
 * idempotent: re-sending the same status is a no-op that returns the
 * enriched DTO without a DB write.
 */
export class PatchStatusDto {
  @IsIn(['open', 'closed', 'archived'])
  status!: 'open' | 'closed' | 'archived';
}
