import { IsString, IsEmail, IsOptional } from 'class-validator';

export class IncomingEmailDto {
  @IsEmail()
  from: string;

  @IsEmail()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  messageId?: string;
}
