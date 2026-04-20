import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClientCatalogItemDto {
  @IsString()
  @MaxLength(120)
  sku: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsEnum(['product', 'service'])
  type: 'product' | 'service';

  @IsOptional()
  @Type(() => Number)
  @ValidateIf(
    (o: CreateClientCatalogItemDto) =>
      o.unitAmountMinor !== undefined && o.unitAmountMinor !== null,
  )
  @IsInt()
  @Min(0)
  unitAmountMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @ValidateIf(
    (o: CreateClientCatalogItemDto) =>
      o.unitAmountMinor !== undefined && o.unitAmountMinor !== null,
  )
  currency?: string;
}

export class ClientCatalogItemUpsertRowDto extends CreateClientCatalogItemDto {}

export class BulkUpsertClientCatalogItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ClientCatalogItemUpsertRowDto)
  items: ClientCatalogItemUpsertRowDto[];
}
