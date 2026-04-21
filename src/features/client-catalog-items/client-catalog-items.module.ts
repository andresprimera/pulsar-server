import { Module } from '@nestjs/common';
import { AgentModule } from '@agent/agent.module';
import { ClientCatalogItemsController } from './client-catalog-items.controller';
import { ClientCatalogItemsService } from './client-catalog-items.service';

@Module({
  imports: [AgentModule],
  controllers: [ClientCatalogItemsController],
  providers: [ClientCatalogItemsService],
})
export class ClientCatalogItemsModule {}
