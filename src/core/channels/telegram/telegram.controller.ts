import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Webhook URL should include the hired bot's numeric id (token prefix) so the
   * server can load credentials and verify `X-Telegram-Bot-Api-Secret-Token`.
   */
  @Post('webhook/:telegramBotId')
  @HttpCode(200)
  handleWebhook(
    @Param('telegramBotId') telegramBotId: string,
    @Body() body: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
  ): string {
    this.telegramService
      .handleIncoming(telegramBotId, body, secretToken)
      .catch((error) => {
        this.logger.error(
          `Failed to process Telegram webhook: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    return 'ok';
  }
}
