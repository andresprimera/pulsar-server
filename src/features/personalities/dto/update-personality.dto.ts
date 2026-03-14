import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdatePersonalityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  examplePhrases?: string[];

  @IsOptional()
  @IsString()
  guardrails?: string;

  @IsOptional()
  @IsString()
  promptTemplate?: string;
}
