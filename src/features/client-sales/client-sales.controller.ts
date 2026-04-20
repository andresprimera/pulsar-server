import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClientSalesService } from './client-sales.service';
import { CreateClientSaleDto } from './dto/create-client-sale.dto';
import { UpdateClientSaleDto } from './dto/update-client-sale.dto';
import { ListClientSalesQueryDto } from './dto/list-client-sales-query.dto';

@Controller('clients/:clientId/sales')
export class ClientSalesController {
  constructor(private readonly clientSalesService: ClientSalesService) {}

  @Post()
  async create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.clientSalesService.create(
      clientId,
      dto,
      idempotencyKey,
    );
    res.status(out.statusCode);
    return out.sale;
  }

  @Get()
  findAll(
    @Param('clientId') clientId: string,
    @Query() query: ListClientSalesQueryDto,
  ) {
    return this.clientSalesService.findAllForClient(clientId, query);
  }

  @Get(':saleId')
  findOne(
    @Param('clientId') clientId: string,
    @Param('saleId') saleId: string,
  ) {
    return this.clientSalesService.findOne(clientId, saleId);
  }

  @Patch(':saleId')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  update(
    @Param('clientId') clientId: string,
    @Param('saleId') saleId: string,
    @Body() dto: UpdateClientSaleDto,
  ) {
    return this.clientSalesService.update(clientId, saleId, dto);
  }

  @Delete(':saleId')
  @HttpCode(204)
  async remove(
    @Param('clientId') clientId: string,
    @Param('saleId') saleId: string,
  ) {
    await this.clientSalesService.remove(clientId, saleId);
  }
}
