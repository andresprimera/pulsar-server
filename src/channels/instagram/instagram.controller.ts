import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  Headers,
  Logger,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { InstagramService } from './instagram.service';

@Controller('instagram')
export class InstagramController {
  private readonly logger = new Logger(InstagramController.name);

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
  handleWebhook(
    @Body() payload: unknown,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ): string {
    this.instagramService
      .handleIncoming(payload, signature, req.rawBody)
      .catch((error) => {
        this.logger.error(
          `Failed to process Instagram webhook: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    return 'ok';
  }
}
