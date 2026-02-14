/**
 * Server-level WhatsApp configuration.
 *
 * Per-client values (accessToken, phoneNumberId) come from DB credentials,
 * not from env vars.
 */
export interface WhatsAppServerConfig {
  /** API host — real Cloud API or a local mock. */
  apiHost: string;
  /** Cloud API version segment (e.g. "v18.0"). */
  apiVersion: string;
  /** Token Meta sends in the webhook verification request. */
  webhookVerifyToken: string;
}

/**
 * Load server-level WhatsApp configuration from environment variables.
 *
 * In dev mode set `WHATSAPP_API_HOST` to point at a mock server
 * (e.g. `http://localhost:3005`).
 *
 * In production leave it unset — it defaults to `https://graph.facebook.com`.
 */
export function loadWhatsAppConfig(): WhatsAppServerConfig {
  return {
    apiHost:
      process.env.WHATSAPP_API_HOST || 'https://graph.facebook.com',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    webhookVerifyToken:
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'dev',
  };
}

/**
 * Build the Cloud API messages URL for a specific phone number.
 *
 * Result: `{apiHost}/{apiVersion}/{phoneNumberId}/messages`
 */
export function buildMessagesUrl(
  config: WhatsAppServerConfig,
  phoneNumberId: string,
): string {
  return `${config.apiHost}/${config.apiVersion}/${phoneNumberId}/messages`;
}
