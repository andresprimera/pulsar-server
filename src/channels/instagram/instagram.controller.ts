import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  Headers,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { InstagramService } from './instagram.service';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.instagramService.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: unknown,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<string> {
    await this.instagramService.handleIncoming(payload, signature, req.rawBody);
    return 'ok';
  }
}
