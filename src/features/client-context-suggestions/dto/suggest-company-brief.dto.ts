import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestCompanyBriefDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  existingDraft?: string;
}
