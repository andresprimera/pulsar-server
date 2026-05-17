import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { ClientAuth } from '@shared/decorators/client-auth.decorator';
import { ClientRoles } from '@shared/decorators/client-roles.decorator';
import { CurrentClientUser } from '@shared/decorators/current-client-user.decorator';
import { ClientUserPrincipal } from '@shared/types/express';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentSummaryForClientDto } from './dto/client-agent-summary-for-client.dto';

/**
 * Client-tier `ClientAgents` controller — sibling of the admin
 * `ClientAgentsController`. Kept in a separate file (`.client.controller.ts`
 * suffix) so admin and client decorator stacks, DTOs, and tenant-derivation
 * logic stay syntactically isolated.
 *
 * Tenant identity is read exclusively from `request.clientUser.clientId` via
 * `@CurrentClientUser()` — there is no `@Param`, `@Query`, or `@Body`
 * accepting `clientId`, so a smuggled value cannot reach the service. For
 * the same reason `@OwnsClient(...)` is intentionally absent: that decorator
 * only applies to routes whose composed path contains the literal
 * `:clientId` segment (see `test/architecture/clientid-routes-have-owns-client.spec.ts`).
 */
@Controller('client-agents')
export class ClientAgentsClientController {
  constructor(private readonly clientAgentsService: ClientAgentsService) {}

  @ClientAuth()
  @ClientRoles('owner', 'operator')
  @Get('me')
  async listMine(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
  ): Promise<ClientAgentSummaryForClientDto[]> {
    if (principal === undefined || principal.clientId.length === 0) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.clientAgentsService.findByClientForClient(principal.clientId);
  }
}
