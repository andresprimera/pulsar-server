import { Injectable, Logger } from '@nestjs/common';
import { ChannelRouter } from '@channels/channel-router';

export interface GatewaySendInput {
  channel: string;
  to: string;
  message: string;
  provider?: string;
  credentials: unknown;
}

@Injectable()
export class MessagingGatewayService {
  private readonly logger = new Logger(MessagingGatewayService.name);

  constructor(private readonly channelRouter: ChannelRouter) {}

  async send(input: GatewaySendInput): Promise<void> {
    const adapter = this.channelRouter.resolve(input.channel);

    this.logger.log(
      `Dispatching outbound message via channel="${input.channel}"`,
    );

    await adapter.sendMessage({
      to: input.to,
      message: input.message,
      provider: input.provider,
      credentials: input.credentials,
    });
  }
}
