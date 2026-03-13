import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateClientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/i, {
    message: 'billingCurrency must be a valid ISO 4217 code (e.g. USD, EUR)',
  })
  billingCurrency?: string;

  @IsOptional()
  @IsString()
  brandVoice?: string;
}
