import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SuggestPromptSupplementDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  organizationName?: string;

  @IsOptional()
  @IsIn(['individual', 'organization'])
  clientType?: 'individual' | 'organization';

  /** Organization-wide context from an earlier step (optional grounding). */
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  companyBrief?: string;

  @IsOptional()
  @IsMongoId()
  agentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  agentName?: string;

  @IsOptional()
  @IsMongoId()
  personalityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  personalityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  existingDraft?: string;
}
