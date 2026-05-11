import { IsString, IsOptional, IsInt, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AGENT_KINDS, type AgentKind } from '@shared/agent-kind.constants';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsEnum(AGENT_KINDS)
  kind: AgentKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyTokenQuota?: number | null;
}
