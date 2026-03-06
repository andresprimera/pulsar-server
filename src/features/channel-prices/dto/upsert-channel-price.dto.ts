import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertChannelPriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}
