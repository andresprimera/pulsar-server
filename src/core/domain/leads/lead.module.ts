import { Module } from '@nestjs/common';
import { LeadLifecycleService } from './lead-lifecycle.service';

/**
 * Domain module for lead lifecycle. Exposes the pure
 * {@link LeadLifecycleService} for agent-layer consumers (the bootstrap
 * service wraps repo + lifecycle).
 */
@Module({
  providers: [LeadLifecycleService],
  exports: [LeadLifecycleService],
})
export class LeadModule {}
