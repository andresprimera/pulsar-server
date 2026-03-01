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
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LlmProvider } from '@agent/llm/provider.enum';
import { ChannelProvider } from '@channels/channel-provider.enum';

class UserDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail()
  email: string;

  @IsString()
  name: string;
}

class ClientDto {
  @IsEnum(['individual', 'organization'])
  type: 'individual' | 'organization';

  @IsOptional()
  @IsString()
  name?: string;
}

class AgentHiringDto {
  @IsMongoId()
  agentId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
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

class HireChannelConfigDto {
  @IsMongoId()
  channelId: string;

  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEnum(ChannelProvider)
  provider: ChannelProvider;

  @IsObject()
  credentials: Record<string, any>;

  @ValidateNested()
  @Type(() => LlmConfigDto)
  llmConfig: LlmConfigDto;
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
