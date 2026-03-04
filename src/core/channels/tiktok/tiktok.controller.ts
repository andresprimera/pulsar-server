import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { TiktokService } from './tiktok.service';

@Controller('tiktok')
export class TiktokController {
  private readonly logger = new Logger(TiktokController.name);

  constructor(private readonly tiktokService: TiktokService) {}

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Body() payload: unknown): string {
    this.tiktokService.handleIncoming(payload).catch((error) => {
      this.logger.error(
        `Failed to process TikTok webhook: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    });
    return 'ok';
  }
}
