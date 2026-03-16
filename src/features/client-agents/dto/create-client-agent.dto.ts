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

  @IsMongoId()
  @IsNotEmpty()
  personalityId: string;

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
