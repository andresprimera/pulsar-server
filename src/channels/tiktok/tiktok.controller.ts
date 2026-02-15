import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { TiktokService } from './tiktok.service';

@Controller('tiktok')
export class TiktokController {
  constructor(private readonly tiktokService: TiktokService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() payload: unknown): Promise<string> {
    await this.tiktokService.handleIncoming(payload);
    return 'ok';
  }
}
