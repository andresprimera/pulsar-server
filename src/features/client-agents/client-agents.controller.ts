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
import { ClientAgentsService } from './client-agents.service';
import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';
import { ListClientAgentsQueryDto } from './dto/list-client-agents-query.dto';

/**
 * Internal/admin ClientAgents API.
 * WARNING: Endpoints in this controller are NOT guarded by auth in this PR.
 * Until the follow-up auth guard ships, this controller MUST only be reachable
 * from internal networks / behind an admin reverse proxy. Do not expose
 * /client-agents publicly.
 */
@Controller('client-agents')
export class ClientAgentsController {
  constructor(private readonly clientAgentsService: ClientAgentsService) {}

  @Post()
  create(@Body() createDto: CreateClientAgentDto) {
    return this.clientAgentsService.create(createDto);
  }

  /**
   * Admin list of ClientAgents with hydrated, redacted summaries.
   * Returns a pagination envelope: `{ items, page, limit, total, totalPages }`.
   * See `docs/api-endpoints.md#pagination-envelope` for full semantics.
   */
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

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.clientAgentsService.findByClient(clientId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateClientAgentDto) {
    return this.clientAgentsService.update(id, updateDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateClientAgentStatusDto,
  ) {
    return this.clientAgentsService.updateStatus(id, updateDto);
  }

  // Modified route to match controller structure
  @Get('billing/client/:clientId')
  calculateClientTotal(@Param('clientId') clientId: string) {
    return this.clientAgentsService.calculateClientTotal(clientId);
  }
}
