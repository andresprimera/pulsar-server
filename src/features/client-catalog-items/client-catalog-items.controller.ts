import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientCatalogItemsService } from './client-catalog-items.service';
import {
  BulkUpsertClientCatalogItemsDto,
  CreateClientCatalogItemDto,
} from './dto/create-client-catalog-item.dto';
import { UpdateClientCatalogItemDto } from './dto/update-client-catalog-item.dto';
import { CATALOG_IMPORT_MAX_FILE_BYTES } from './catalog-import.constants';

@Controller('clients/:clientId/catalog-items')
export class ClientCatalogItemsController {
  constructor(
    private readonly clientCatalogItemsService: ClientCatalogItemsService,
  ) {}

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATALOG_IMPORT_MAX_FILE_BYTES },
    }),
  )
  importCatalog(
    @Param('clientId') clientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.clientCatalogItemsService.importFromUpload(clientId, file);
  }

  @Post('bulk-upsert')
  bulkUpsert(
    @Param('clientId') clientId: string,
    @Body() dto: BulkUpsertClientCatalogItemsDto,
  ) {
    return this.clientCatalogItemsService.bulkUpsert(clientId, dto.items);
  }

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientCatalogItemDto,
  ) {
    return this.clientCatalogItemsService.create(clientId, dto);
  }

  @Get()
  findAll(@Param('clientId') clientId: string) {
    return this.clientCatalogItemsService.findAllForClient(clientId);
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
