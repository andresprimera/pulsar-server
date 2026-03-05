import { Controller, Get, Put, Patch, Body, Param } from '@nestjs/common';
import { AgentPricesService } from './agent-prices.service';
import { UpsertAgentPriceDto } from './dto/upsert-agent-price.dto';

@Controller('agents/:agentId/prices')
export class AgentPricesController {
  constructor(private readonly agentPricesService: AgentPricesService) {}

  @Put(':currency')
  upsert(
    @Param('agentId') agentId: string,
    @Param('currency') currency: string,
    @Body() dto: UpsertAgentPriceDto,
  ) {
    return this.agentPricesService.upsert(agentId, currency, dto);
  }

  @Get()
  findByAgent(@Param('agentId') agentId: string) {
    return this.agentPricesService.findByAgent(agentId);
  }

  @Patch(':currency/deprecate')
  deprecate(
    @Param('agentId') agentId: string,
    @Param('currency') currency: string,
  ) {
    return this.agentPricesService.deprecate(agentId, currency);
  }
}
