import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateClientCatalogItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsEnum(['product', 'service'])
  type?: 'product' | 'service';

  @IsOptional()
  @Type(() => Number)
  @ValidateIf(
    (o: UpdateClientCatalogItemDto) =>
      o.unitAmountMinor !== undefined && o.unitAmountMinor !== null,
  )
  @IsInt()
  @Min(0)
  unitAmountMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @ValidateIf(
    (o: UpdateClientCatalogItemDto) =>
      o.unitAmountMinor !== undefined && o.unitAmountMinor !== null,
  )
  currency?: string;
}
