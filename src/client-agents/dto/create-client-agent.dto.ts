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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChannelProvider } from '@channels/channel-provider.enum';
import { LlmProvider } from '@agent/llm/provider.enum';

class LlmConfigDto {
  @IsEnum(LlmProvider)
  provider: LlmProvider;

  @IsString()
  apiKey: string;

  @IsString()
  model: string;
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
}

export class CreateClientAgentDto {
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;

  @IsMongoId()
  @IsNotEmpty()
  agentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => HireChannelConfigDto)
  channels: HireChannelConfigDto[];
}
