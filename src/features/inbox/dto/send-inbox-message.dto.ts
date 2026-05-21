import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body shape for `POST /inbox/conversations/:conversationId/messages`.
 *
 * `text` is trimmed by `@Transform` before length validation runs, so an
 * all-whitespace body is rejected as empty (not as "too long" or "valid").
 * Max length is the conservative 4 KB ceiling the FE renders comfortably;
 * attachments are out of scope for Phase 2.
 */
export class SendInboxMessageDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'text must be non-empty after trim' })
  @MaxLength(4096)
  text!: string;
}
