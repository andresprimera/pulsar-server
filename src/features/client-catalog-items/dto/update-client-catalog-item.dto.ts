import {
  IsBoolean,
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
  @ValidateIf(
    (_o: UpdateClientCatalogItemDto, v: unknown) =>
      v !== null && v !== undefined,
  )
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsEnum(['product', 'service'])
  type?: 'product' | 'service';

  @IsOptional()
  @ValidateIf(
    (_o: UpdateClientCatalogItemDto, v: unknown) =>
      v !== null && v !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitAmountMinor?: number | null;

  @IsOptional()
  @ValidateIf(
    (_o: UpdateClientCatalogItemDto, v: unknown) =>
      v !== null && v !== undefined,
  )
  @IsString()
  @MaxLength(3)
  currency?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
