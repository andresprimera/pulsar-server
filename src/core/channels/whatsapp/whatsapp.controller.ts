import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppProviderRouter } from './provider-router';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsAppChannelService: WhatsAppChannelService,
    private readonly providerRouter: WhatsAppProviderRouter,
  ) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.whatsAppChannelService.verifyMetaWebhook(
      mode,
      token,
      challenge,
    );
  }

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Body() payload: unknown): string {
    this.logger.log(`Incoming WhatsApp webhook (${ChannelProvider.Meta})`);
    this.whatsAppChannelService
      .handleIncoming(payload, ChannelProvider.Meta)
      .catch((error) => {
        this.logger.error(
          `Failed to process WhatsApp webhook (${ChannelProvider.Meta}): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    return 'ok';
  }

  @Post('webhook/:provider')
  @HttpCode(200)
  handleProviderWebhook(
    @Body() payload: unknown,
    @Param('provider') provider: string,
  ): string {
    if (!this.providerRouter.hasAdapter(provider)) {
      throw new BadRequestException(
        `Unsupported WhatsApp provider: ${provider}`,
      );
    }

    this.logger.log(`Incoming WhatsApp webhook (${provider})`);
    this.whatsAppChannelService
      .handleIncoming(payload, provider as any)
      .catch((error) => {
        this.logger.error(
          `Failed to process WhatsApp webhook (${provider}): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    return 'ok';
  }
}
