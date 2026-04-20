import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ClientCatalogItemsService } from './client-catalog-items.service';
import {
  BulkUpsertClientCatalogItemsDto,
  CreateClientCatalogItemDto,
} from './dto/create-client-catalog-item.dto';
import { UpdateClientCatalogItemDto } from './dto/update-client-catalog-item.dto';
import { ListClientCatalogItemsQueryDto } from './dto/list-client-catalog-items-query.dto';

@Controller('clients/:clientId/catalog-items')
export class ClientCatalogItemsController {
  constructor(
    private readonly clientCatalogItemsService: ClientCatalogItemsService,
  ) {}

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientCatalogItemDto,
  ) {
    return this.clientCatalogItemsService.create(clientId, dto);
  }

  @Post('bulk-upsert')
  bulkUpsert(
    @Param('clientId') clientId: string,
    @Body() dto: BulkUpsertClientCatalogItemsDto,
  ) {
    return this.clientCatalogItemsService.bulkUpsert(clientId, dto.items);
  }

  @Get()
  findAll(
    @Param('clientId') clientId: string,
    @Query() query: ListClientCatalogItemsQueryDto,
  ) {
    return this.clientCatalogItemsService.findAllForClient(clientId, query);
  }

  @Get(':catalogItemId')
  findOne(
    @Param('clientId') clientId: string,
    @Param('catalogItemId') catalogItemId: string,
  ) {
    return this.clientCatalogItemsService.findOne(clientId, catalogItemId);
  }

  @Patch(':catalogItemId')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  update(
    @Param('clientId') clientId: string,
    @Param('catalogItemId') catalogItemId: string,
    @Body() dto: UpdateClientCatalogItemDto,
  ) {
    return this.clientCatalogItemsService.update(clientId, catalogItemId, dto);
  }

  @Delete(':catalogItemId')
  remove(
    @Param('clientId') clientId: string,
    @Param('catalogItemId') catalogItemId: string,
  ) {
    return this.clientCatalogItemsService.softDelete(clientId, catalogItemId);
  }
}
