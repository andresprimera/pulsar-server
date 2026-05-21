import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListConversationsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['open', 'closed', 'archived'])
  status?: 'open' | 'closed' | 'archived';

  @IsOptional()
  @IsString()
  @IsMongoId()
  channelId?: string;

  /**
   * The underlying `Agent._id` (the assistant kind), NOT the
   * `ClientAgent._id` (the per-tenant hire). The service resolves it to
   * `clientAgentId` via `findByClientAndAgent(clientId, agentId)` and
   * returns an empty page when the tenant has no hire for that agent —
   * mismatches do not surface as 4xx. Pass the value the FE filter
   * dropdown exposes from `GET /client-agents/me` (`row.agent.id`), not
   * the hire row's `id`.
   */
  @IsOptional()
  @IsString()
  @IsMongoId()
  agentId?: string;

  /**
   * @remarks
   * Bounded `O(limit)` case-insensitive substring match on
   * `contactNameLower` after `inbox_list_idx` narrows the page.
   * `lastMessagePreviewLower` is reserved for Phase-2 anchored-prefix
   * search and is NOT queried in Phase 1. Validators are unchanged
   * across phases.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(120)
  q?: string;
}
