import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CreatedBeforeAfterCreatedAfter } from './validators/created-before-after-created-after.validator';

@CreatedBeforeAfterCreatedAfter()
export class ListClientAgentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * Single field only. Whitelist: createdAt | updatedAt | status, optional `-` prefix for desc.
   * Multi-field comma-separated sorts are NOT supported in this PR.
   */
  @IsOptional()
  @IsString()
  @Matches(/^-?(createdAt|updatedAt|status)$/)
  sort?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'archived'])
  status?: 'active' | 'inactive' | 'archived';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  clientId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agentId?: string;

  @IsOptional()
  @IsMongoId()
  personalityId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAfter?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdBefore?: Date;
}
