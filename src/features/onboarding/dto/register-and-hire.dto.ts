import {
  IsString,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  Min,
  ArrayMinSize,
  Matches,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LlmProvider } from '@domain/llm/provider.enum';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';

class UserDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail()
  email: string;

  @IsString()
  name: string;
}

class LlmConfigDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEnum(LlmProvider)
  provider: LlmProvider;

  @IsString()
  apiKey: string;

  @IsString()
  model: string;
}

class ClientDto {
  @IsEnum(['individual', 'organization'])
  type: 'individual' | 'organization';

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message:
      'billingCurrency must be a valid ISO 4217 code (e.g. USD, EUR, BRL)',
  })
  billingCurrency?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmConfigDto)
  llmConfig?: LlmConfigDto;
}

class PricingOverrideDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  agentAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  agentMonthlyTokenQuota?: number | null;
}

class AgentHiringDto {
  @IsMongoId()
  agentId: string;

  @IsMongoId()
  personalityId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PricingOverrideDto)
  pricingOverride?: PricingOverrideDto;
}

class HireChannelConfigDto {
  @IsMongoId()
  channelId: string;

  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEnum(ChannelProvider)
  provider: ChannelProvider;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;

  /** Routing identifier for the channel (e.g. phoneNumberId for WhatsApp, instagramAccountId for Instagram). Required when credentials are omitted. */
  @IsOptional()
  @IsString()
  routingIdentifier?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountOverride?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyMessageQuotaOverride?: number | null;
}

export class RegisterAndHireDto {
  @ValidateNested()
  @Type(() => UserDto)
  user: UserDto;

  @ValidateNested()
  @Type(() => ClientDto)
  client: ClientDto;

  @ValidateNested()
  @Type(() => AgentHiringDto)
  agentHiring: AgentHiringDto;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => HireChannelConfigDto)
  channels: HireChannelConfigDto[];
}
