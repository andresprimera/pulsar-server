import { Module } from '@nestjs/common';
import { ClientsModule } from '@clients/clients.module';
import { ClientCatalogItemsController } from './client-catalog-items.controller';
import { ClientCatalogItemsService } from './client-catalog-items.service';

@Module({
  imports: [ClientsModule],
  controllers: [ClientCatalogItemsController],
  providers: [ClientCatalogItemsService],
  exports: [ClientCatalogItemsService],
})
export class ClientCatalogItemsModule {}
