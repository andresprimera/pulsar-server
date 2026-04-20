import { Module } from '@nestjs/common';
import { ClientsModule } from '@clients/clients.module';
import { ClientSalesController } from './client-sales.controller';
import { ClientSalesService } from './client-sales.service';

@Module({
  imports: [ClientsModule],
  controllers: [ClientSalesController],
  providers: [ClientSalesService],
})
export class ClientSalesModule {}
