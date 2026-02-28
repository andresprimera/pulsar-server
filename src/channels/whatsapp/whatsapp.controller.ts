import { Controller, Get, Post, Query, Body, HttpCode, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.whatsappService.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Body() payload: unknown): string {
    this.logger.log(`Incoming WhatsApp webhook payload: ${JSON.stringify(payload)}`);
    this.whatsappService.handleIncoming(payload).catch((error) => {
      this.logger.error(
        `Failed to process WhatsApp webhook: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
    return 'ok';
  }
}
