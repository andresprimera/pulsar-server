import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator';

export class CreatePersonalityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  promptTemplate: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  communicationStyle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  examplePhrases?: string[];

  @IsOptional()
  @IsString()
  guardrails?: string;
}
