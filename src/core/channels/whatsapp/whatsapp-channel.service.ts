import { Injectable, Logger } from '@nestjs/common';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { IncomingChannelEvent } from '@domain/channels/incoming-channel-event.interface';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ChannelProviderValue } from '@shared/channel-provider.constants';
import { decryptRecord } from '@shared/crypto.util';
import {
  ChannelAdapter,
  SendMessageInput,
} from '@channels/channel-adapter.interface';
import { ChannelAdapterProvider } from '@channels/channel-adapter.decorator';
import { WhatsAppProviderRouter } from './provider-router';
import {
  MetaCredentials,
  Dialog360Credentials,
  WhatsAppProviderCredentials,
} from './providers/whatsapp-provider.interface';

const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEDUP_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

@ChannelAdapterProvider()
@Injectable()
export class WhatsAppChannelService implements ChannelAdapter {
  readonly channel = CHANNEL_TYPES.WHATSAPP;
  private readonly logger = new Logger(WhatsAppChannelService.name);
  private readonly processedMessages = new Map<string, number>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
    private readonly providerRouter: WhatsAppProviderRouter,
  ) {
    this.cleanupInterval = setInterval(
      () => this.evictExpiredEntries(),
      DEDUP_CLEANUP_INTERVAL_MS,
    );
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  verifyMetaWebhook(mode: string, token: string, challenge: string): string {
    const adapter = this.providerRouter.resolve(ChannelProvider.Meta);
    if (!adapter.verifyWebhook) {
      throw new Error('Meta adapter must support webhook verification');
    }
    const result = adapter.verifyWebhook(mode, token, challenge);
    if (result === undefined) {
      throw new Error('Verification returned undefined');
    }
    return result;
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    const provider = (input.provider ??
      ChannelProvider.Meta) as ChannelProviderValue;
    const adapter = this.providerRouter.resolve(provider);

    const credentials = this.resolveCredentials(input.credentials, provider);
    if (!credentials) {
      throw new Error(
        `[WhatsApp/${provider}] Unable to resolve credentials for outbound message`,
      );
    }

    await adapter.sendMessage(input.to, input.message, credentials);
  }

  async handleIncoming(
    payload: unknown,
    provider: ChannelProviderValue,
  ): Promise<void> {
    const adapter = this.providerRouter.resolve(provider);
    const parsed = adapter.parseInbound(payload);

    if (!parsed) {
      return;
    }

    if (this.isDuplicate(parsed.messageId)) {
      this.logger.log(
        `[WhatsApp/${provider}] Duplicate webhook ignored messageId=${parsed.messageId}`,
      );
      return;
    }

    this.logger.log(
      `[WhatsApp/${provider}] Incoming message phoneNumberId=${parsed.phoneNumberId} messageId=${parsed.messageId}`,
    );

    const event: IncomingChannelEvent = {
      channelId: CHANNEL_TYPES.WHATSAPP,
      routeChannelIdentifier: parsed.phoneNumberId,
      channelIdentifier: parsed.senderId,
      messageId: parsed.messageId,
      text: parsed.text,
      rawPayload: payload,
    };

    const output = await this.incomingMessageOrchestrator.handle(event);
    if (!output?.reply) {
      return;
    }

    const outboundProvider = output.channelMeta?.provider ?? provider;
    const outboundAdapter = this.providerRouter.resolve(outboundProvider);

    const credentials = this.resolveCredentials(
      output.channelMeta?.encryptedCredentials,
      outboundProvider,
    );
    if (!credentials) {
      this.logger.warn(
        `[WhatsApp/${outboundProvider}] Missing credentials for phoneNumberId=${parsed.phoneNumberId}`,
      );
      return;
    }

    this.logger.log(
      `[WhatsApp/${outboundProvider}] Sending reply to=${event.channelIdentifier} phoneNumberId=${parsed.phoneNumberId}`,
    );

    try {
      await outboundAdapter.sendMessage(
        event.channelIdentifier,
        output.reply.text,
        credentials,
      );
    } catch (error) {
      this.logger.error(
        `[WhatsApp/${outboundProvider}] Failed to send reply to=${
          event.channelIdentifier
        }: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isDuplicate(messageId: string): boolean {
    if (this.processedMessages.has(messageId)) {
      return true;
    }
    this.processedMessages.set(messageId, Date.now());
    return false;
  }

  private evictExpiredEntries(): void {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [id, timestamp] of this.processedMessages) {
      if (timestamp < cutoff) {
        this.processedMessages.delete(id);
      }
    }
  }

  private resolveCredentials(
    encryptedCredentials: unknown,
    provider: ChannelProviderValue,
  ): WhatsAppProviderCredentials | undefined {
    if (
      !encryptedCredentials ||
      typeof encryptedCredentials !== 'object' ||
      Array.isArray(encryptedCredentials)
    ) {
      return undefined;
    }

    const decrypted = decryptRecord(
      encryptedCredentials as Record<string, any>,
    );

    if (!decrypted.phoneNumberId) {
      return undefined;
    }

    if (provider === ChannelProvider.Dialog360) {
      const apiKey = decrypted.apiKey || decrypted.accessToken;
      if (!apiKey) {
        return undefined;
      }
      return {
        phoneNumberId: decrypted.phoneNumberId,
        apiKey,
      } satisfies Dialog360Credentials;
    }

    if (!decrypted.accessToken) {
      return undefined;
    }
    return {
      phoneNumberId: decrypted.phoneNumberId,
      accessToken: decrypted.accessToken,
    } satisfies MetaCredentials;
  }
}
