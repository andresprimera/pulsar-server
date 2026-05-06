export interface RegisterWebhookResult {
  registered: boolean;
  fingerprint: string;
  error?: string;
}

export type RegisterWebhookInput =
  | {
      kind: 'plaintext';
      telegramBotId: string;
      botToken: string;
      publicBaseUrl: string;
    }
  | {
      kind: 'encrypted';
      telegramBotId: string;
      encryptedCredentials: Record<string, unknown>;
      publicBaseUrl: string;
    };

export interface ChannelLifecycleAdapter {
  readonly channel: string;
  registerWebhook(input: RegisterWebhookInput): Promise<RegisterWebhookResult>;
  deregisterWebhook?(input: RegisterWebhookInput): Promise<void>;
}
