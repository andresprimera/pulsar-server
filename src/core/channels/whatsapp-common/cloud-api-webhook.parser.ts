import { ParsedWhatsAppInbound } from '@channels/whatsapp/providers/whatsapp-provider.interface';

/**
 * Parse a WhatsApp Cloud API webhook payload into a normalized inbound message.
 *
 * Both Meta and 360dialog use the identical Cloud API webhook format:
 *   entry[].changes[].value.messages[]
 *
 * Returns undefined for non-text messages, status updates, or invalid payloads.
 */
export function parseCloudApiWebhook(
  payload: unknown,
): ParsedWhatsAppInbound | undefined {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !hasCloudApiStructure(payload)
  ) {
    return undefined;
  }

  const value = (payload as any).entry[0].changes[0].value;
  const message = value.messages[0];

  if (message.type !== 'text') {
    return undefined;
  }

  const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
  const senderId: string | undefined = message.from;
  const messageId: string | undefined = message.id;
  const text: string | undefined = message.text?.body;

  if (!phoneNumberId || !senderId || !messageId || !text) {
    return undefined;
  }

  return { phoneNumberId, senderId, messageId, text };
}

function hasCloudApiStructure(payload: unknown): boolean {
  try {
    return !!(payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages;
  } catch {
    return false;
  }
}
