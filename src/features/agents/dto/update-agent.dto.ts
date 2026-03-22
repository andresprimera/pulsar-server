import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyTokenQuota?: number | null;
}
