import { IsEnum, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LlmProvider } from '@domain/llm/provider.enum';

class LlmOverrideDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEnum(LlmProvider)
  provider: LlmProvider;

  @IsString()
  model: string;
}

export class CreateAgentDto {
  @IsString()
  name: string;

  @IsString()
  systemPrompt: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmOverrideDto)
  llmOverride?: LlmOverrideDto;
}
