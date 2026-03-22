import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAgentDto {
  @IsString()
  name: string;

  @IsString()
  systemPrompt: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyTokenQuota?: number | null;
}
