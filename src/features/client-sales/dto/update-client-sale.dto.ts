import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CLIENT_SALE_STATUS_VALUES,
  type ClientSaleStatus,
} from '@persistence/schemas/client-sale.schema';

export class UpdateClientSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn([...CLIENT_SALE_STATUS_VALUES])
  status?: ClientSaleStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsMongoId()
  catalogItemId?: string | null;

  /** ISO-8601 string or epoch ms (integer). Validated in service when present. */
  @IsOptional()
  occurredAt?: string | number;
}
