import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { ClientAgentsService } from './client-agents.service';
import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';
import { ListClientAgentsQueryDto } from './dto/list-client-agents-query.dto';

/**
 * Internal/admin ClientAgents API. Admin-tier (no `@ClientAuth()`); the
 * global `RolesGuard` and `OwnsClientGuard` (registered in
 * `AuthorizationModule`) gate every handler. Admin-tier `:clientId` routes
 * are intentionally exempt from `@OwnsClient(...)` because the super-admin
 * operating model requires admins to read across all clients.
 */
@Controller('client-agents')
export class ClientAgentsController {
  constructor(private readonly clientAgentsService: ClientAgentsService) {}

  @Roles('super_admin')
  @Post()
  create(@Body() createDto: CreateClientAgentDto) {
    return this.clientAgentsService.create(createDto);
  }

  /**
   * Admin list of ClientAgents with hydrated, redacted summaries.
   * Returns a pagination envelope: `{ items, page, limit, total, totalPages }`.
   * See `docs/api-endpoints.md#pagination-envelope` for full semantics.
   */
  @Roles('super_admin', 'support')
  @Get()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  findAll(@Query() query: ListClientAgentsQueryDto) {
    return this.clientAgentsService.findAllHydrated(query);
  }

  @Roles('super_admin', 'support')
  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.clientAgentsService.findByClient(clientId);
  }

  @Roles('super_admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateClientAgentDto) {
    return this.clientAgentsService.update(id, updateDto);
  }

  @Roles('super_admin')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateClientAgentStatusDto,
  ) {
    return this.clientAgentsService.updateStatus(id, updateDto);
  }

  @Roles('super_admin', 'support')
  @Get('billing/client/:clientId')
  calculateClientTotal(@Param('clientId') clientId: string) {
    return this.clientAgentsService.calculateClientTotal(clientId);
  }
}
