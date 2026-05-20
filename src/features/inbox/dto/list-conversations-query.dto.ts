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
