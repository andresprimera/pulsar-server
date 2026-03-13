import { IsMongoId, IsOptional } from 'class-validator';

/**
 * Pricing is snapshotted at hire time and is immutable.
 * Only status changes are allowed via updateStatus.
 * personalityId may be updated to switch the agent's personality.
 */
export class UpdateClientAgentDto {
  @IsOptional()
  @IsMongoId()
  personalityId?: string;
}
