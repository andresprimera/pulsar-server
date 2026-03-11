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
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { WhatsAppProviderRouter } from './provider-router';
import {
  MetaCredentials,
  Dialog360Credentials,
  TwilioCredentials,
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
    private readonly channelEnvService: ChannelEnvService,
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
    // Gateway path: no routeChannelIdentifier; phoneNumberId must come from DB credentials.
    const credentials = this.resolveCredentialsOrThrow(
      input.credentials,
      provider,
      undefined,
    );
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

    const routeChannelIdentifier = output.channelMeta?.routeChannelIdentifier;
    let credentials: WhatsAppProviderCredentials;
    try {
      credentials = this.resolveCredentialsOrThrow(
        output.channelMeta?.encryptedCredentials,
        outboundProvider,
        routeChannelIdentifier,
      );
    } catch (err) {
      this.logger.warn(
        `[WhatsApp/${outboundProvider}] ${
          err instanceof Error ? err.message : String(err)
        }`,
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

  /**
   * Resolves credentials: routing identifier always from DB (routeChannelIdentifier);
   * auth (accessToken/apiKey) from DB or env fallback.
   * When routeChannelIdentifier is undefined (e.g. gateway send), full credentials must come from DB.
   */
  private resolveCredentialsOrThrow(
    encryptedCredentials: unknown,
    provider: ChannelProviderValue,
    routeChannelIdentifier: string | undefined,
  ): WhatsAppProviderCredentials {
    const decrypted = this.tryDecryptCredentials(encryptedCredentials);

    if (routeChannelIdentifier) {
      // Inbound reply path: phoneNumberId always from DB (orchestrator passed it).
      const phoneNumberId = routeChannelIdentifier;
      if (provider === ChannelProvider.Dialog360) {
        const apiKey: string | undefined =
          (decrypted?.apiKey as string) ||
          (decrypted?.accessToken as string) ||
          this.channelEnvService.getWhatsApp360Credentials()?.apiKey;
        if (!apiKey) {
          throw new Error(
            `[WhatsApp/${provider}] No credentials: provide apiKey in channel config or set WHATSAPP_DIALOG360_API_KEY in .env.`,
          );
        }
        return { phoneNumberId, apiKey } satisfies Dialog360Credentials;
      }
      if (provider === ChannelProvider.Twilio) {
        const twilioEnv = this.channelEnvService.getWhatsAppTwilioCredentials();
        const accountSid: string | undefined =
          (decrypted?.accountSid as string) || twilioEnv?.accountSid;
        const authToken: string | undefined =
          (decrypted?.authToken as string) || twilioEnv?.authToken;
        if (!accountSid || !authToken) {
          throw new Error(
            `[WhatsApp/${provider}] No credentials: provide accountSid and authToken in channel config or set WHATSAPP_TWILIO_ACCOUNT_SID and WHATSAPP_TWILIO_AUTH_TOKEN in .env.`,
          );
        }
        return {
          phoneNumberId,
          accountSid,
          authToken,
        } satisfies TwilioCredentials;
      }
      const accessToken: string | undefined =
        (decrypted?.accessToken as string) ||
        this.channelEnvService.getWhatsAppMetaCredentials()?.accessToken;
      if (!accessToken) {
        throw new Error(
          `[WhatsApp/${provider}] No credentials: provide accessToken in channel config or set WHATSAPP_META_ACCESS_TOKEN in .env.`,
        );
      }
      return { phoneNumberId, accessToken } satisfies MetaCredentials;
    }

    // Gateway path: no route context; phoneNumberId must come from DB credentials.
    const fromDb = this.tryDbCredentials(encryptedCredentials, provider);
    if (fromDb) {
      return fromDb;
    }
    throw new Error(
      `[WhatsApp/${provider}] No credentials: routing identifier and credentials must come from DB when sending via gateway.`,
    );
  }

  private tryDecryptCredentials(
    encryptedCredentials: unknown,
  ): Record<string, unknown> | undefined {
    if (
      !encryptedCredentials ||
      typeof encryptedCredentials !== 'object' ||
      Array.isArray(encryptedCredentials)
    ) {
      return undefined;
    }
    return decryptRecord(encryptedCredentials as Record<string, any>) as Record<
      string,
      unknown
    >;
  }

  private tryDbCredentials(
    encryptedCredentials: unknown,
    provider: ChannelProviderValue,
  ): WhatsAppProviderCredentials | undefined {
    const decrypted = this.tryDecryptCredentials(encryptedCredentials);
    if (!decrypted) {
      return undefined;
    }
    const phoneNumberId = decrypted.phoneNumberId;
    if (!phoneNumberId || typeof phoneNumberId !== 'string') {
      return undefined;
    }
    if (provider === ChannelProvider.Dialog360) {
      const apiKey = decrypted.apiKey || decrypted.accessToken;
      if (!apiKey || typeof apiKey !== 'string') {
        return undefined;
      }
      return {
        phoneNumberId,
        apiKey,
      } satisfies Dialog360Credentials;
    }
    if (provider === ChannelProvider.Twilio) {
      const accountSid = decrypted.accountSid;
      const authToken = decrypted.authToken;
      if (
        !accountSid ||
        typeof accountSid !== 'string' ||
        !authToken ||
        typeof authToken !== 'string'
      ) {
        return undefined;
      }
      return {
        phoneNumberId,
        accountSid,
        authToken,
      } satisfies TwilioCredentials;
    }
    if (!decrypted.accessToken || typeof decrypted.accessToken !== 'string') {
      return undefined;
    }
    return {
      phoneNumberId,
      accessToken: decrypted.accessToken as string,
    } satisfies MetaCredentials;
  }
}
