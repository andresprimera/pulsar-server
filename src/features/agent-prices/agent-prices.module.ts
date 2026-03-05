import { Module } from '@nestjs/common';
import { AgentPricesController } from './agent-prices.controller';
import { AgentPricesService } from './agent-prices.service';

@Module({
  controllers: [AgentPricesController],
  providers: [AgentPricesService],
  exports: [AgentPricesService],
})
export class AgentPricesModule {}
