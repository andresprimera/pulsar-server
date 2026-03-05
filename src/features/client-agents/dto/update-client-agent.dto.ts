/**
 * Pricing is snapshotted at hire time and is immutable.
 * Only status changes are allowed via updateStatus.
 */
export class UpdateClientAgentDto {
  // No updatable fields; pricing and channels are immutable after hire
}
