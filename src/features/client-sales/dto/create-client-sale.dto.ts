import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CLIENT_SALE_STATUS_VALUES,
  type ClientSaleStatus,
} from '@persistence/schemas/client-sale.schema';

export class CreateClientSaleDto {
  @IsOptional()
  @IsMongoId()
  catalogItemId?: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsIn([...CLIENT_SALE_STATUS_VALUES])
  status: ClientSaleStatus;

  @IsInt()
  @Min(0)
  amountMinor: number;

  @IsString()
  @MaxLength(3)
  currency: string;

  /** ISO-8601 string or epoch milliseconds (integer). Validated in service. */
  occurredAt: string | number;
}
