import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  Min,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsEnum,
  IsObject,
  IsString,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { LlmProvider } from '@domain/llm/provider.enum';

class LlmConfigDto {
  @IsEnum(LlmProvider)
  provider: LlmProvider;

  @IsString()
  apiKey: string;

  @IsString()
  model: string;
}

class PricingOverrideDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  agentAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  agentMonthlyTokenQuota?: number | null;
}

class HireChannelConfigDto {
  @IsMongoId()
  channelId: string;

  @IsEnum(ChannelProvider)
  provider: ChannelProvider;

  @IsObject()
  credentials: Record<string, any>;

  @ValidateNested()
  @Type(() => LlmConfigDto)
  llmConfig: LlmConfigDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountOverride?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyMessageQuotaOverride?: number | null;
}

export class CreateClientAgentDto {
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;

  @IsMongoId()
  @IsNotEmpty()
  agentId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PricingOverrideDto)
  pricingOverride?: PricingOverrideDto;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => HireChannelConfigDto)
  channels: HireChannelConfigDto[];
}
