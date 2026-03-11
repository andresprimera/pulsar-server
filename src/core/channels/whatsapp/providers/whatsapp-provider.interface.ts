import { ChannelProvider } from '@domain/channels/channel-provider.enum';

export interface ParsedWhatsAppInbound {
  phoneNumberId: string;
  senderId: string;
  messageId: string;
  text: string;
}

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface Dialog360Credentials {
  phoneNumberId: string;
  apiKey: string;
}

export interface TwilioCredentials {
  phoneNumberId: string;
  accountSid: string;
  authToken: string;
}

export type WhatsAppProviderCredentials =
  | MetaCredentials
  | Dialog360Credentials
  | TwilioCredentials;

export interface WhatsAppProviderAdapter {
  readonly provider: ChannelProvider;

  parseInbound(payload: unknown): ParsedWhatsAppInbound | undefined;

  sendMessage(
    to: string,
    text: string,
    credentials: WhatsAppProviderCredentials,
  ): Promise<void>;

  verifyWebhook?(
    mode: string,
    token: string,
    challenge: string,
  ): string | undefined;
}
