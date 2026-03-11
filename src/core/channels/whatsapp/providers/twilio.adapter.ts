import { Injectable, Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import {
  WhatsAppProviderAdapter,
  ParsedWhatsAppInbound,
  TwilioCredentials,
} from './whatsapp-provider.interface';
import {
  ensureWhatsAppPrefix,
  stripWhatsAppPrefix,
} from '@channels/whatsapp/utils/whatsapp-address.util';

interface TwilioConfig {
  apiBaseUrl: string;
}

interface TwilioWebhookPayload {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
}

function isTwilioPayload(payload: unknown): payload is TwilioWebhookPayload {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    'MessageSid' in payload &&
    'From' in payload &&
    'To' in payload
  );
}

@Injectable()
export class TwilioWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = ChannelProvider.Twilio;
  private readonly logger = new Logger(TwilioWhatsAppAdapter.name);
  private readonly config: TwilioConfig;

  constructor() {
    this.config = {
      apiBaseUrl:
        process.env.WHATSAPP_TWILIO_API_BASE_URL ||
        'https://api.twilio.com/2010-04-01',
    };
  }

  parseInbound(payload: unknown): ParsedWhatsAppInbound | undefined {
    if (!isTwilioPayload(payload)) {
      return undefined;
    }

    const messageSid = payload.MessageSid;
    const from = payload.From;
    const to = payload.To;
    const body = payload.Body;
    const numMedia = payload.NumMedia;

    if (!messageSid || !from || !to) {
      return undefined;
    }

    // Media-only (no text): not supported yet — ignore
    const bodyEmpty =
      body === undefined || body === null || String(body).trim() === '';
    const hasMedia = Number(numMedia) > 0;
    if (bodyEmpty && hasMedia) {
      return undefined;
    }

    // Require text for processing
    if (bodyEmpty) {
      return undefined;
    }

    const phoneNumberId = stripWhatsAppPrefix(to);
    const text = String(body).trim();

    return {
      phoneNumberId,
      senderId: stripWhatsAppPrefix(from),
      messageId: messageSid,
      text,
    };
  }

  async sendMessage(
    to: string,
    text: string,
    credentials: TwilioCredentials,
  ): Promise<void> {
    const url = `${this.config.apiBaseUrl}/Accounts/${credentials.accountSid}/Messages.json`;
    const from = ensureWhatsAppPrefix(credentials.phoneNumberId);
    const toAddress = ensureWhatsAppPrefix(to);

    const params = new URLSearchParams({
      From: from,
      To: toAddress,
      Body: text,
    });

    this.logger.log(
      `Sending message phoneNumberId=${credentials.phoneNumberId} to=${to}`,
    );

    const basicAuth = Buffer.from(
      `${credentials.accountSid}:${credentials.authToken}`,
      'utf8',
    ).toString('base64');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: params.toString(),
      });
    } catch (error) {
      const cause = error instanceof Error ? (error as any).cause : undefined;
      this.logger.error(
        `fetch failed phoneNumberId=${credentials.phoneNumberId} to=${to}: ${
          error instanceof Error ? error.message : String(error)
        }` +
          (cause
            ? ` | cause: ${
                cause instanceof Error ? cause.message : String(cause)
              }`
            : ''),
      );
      throw error;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Send failed phoneNumberId=${credentials.phoneNumberId} to=${to} status=${response.status} body=${errorBody}`,
      );
      throw new Error(`WhatsApp Twilio API error: ${response.status}`);
    }

    this.logger.log(
      `Message sent phoneNumberId=${credentials.phoneNumberId} to=${to}`,
    );
  }
}
