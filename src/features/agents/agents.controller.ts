import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';

/**
 * Internal/admin API for agent management. Default-deny via `RolesGuard`:
 * routes without an explicit `@Roles(...)` decorator are super-admin-only.
 */
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Roles('super_admin', 'support')
  @Get()
  findAll(@Query('status') status?: 'active' | 'inactive' | 'archived') {
    return this.agentsService.findAll(status);
  }

  @Roles('super_admin', 'support')
  @Get('available')
  findAvailable() {
    return this.agentsService.findAvailable();
  }

  @Roles('super_admin', 'support')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAgentStatusDto) {
    return this.agentsService.updateStatus(id, dto);
  }
}
