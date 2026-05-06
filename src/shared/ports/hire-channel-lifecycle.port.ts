export const HIRE_CHANNEL_LIFECYCLE_PORT = Symbol(
  'HIRE_CHANNEL_LIFECYCLE_PORT',
);

export interface WebhookRegistrationStateSnapshot {
  status: 'registering' | 'registered' | 'failed';
  fingerprint?: string;
  lastAttemptAt?: Date;
  registeredAt?: Date;
  attemptCount?: number;
  lastError?: string;
}

export interface HireChannelLifecyclePort {
  recordOutcome(input: {
    telegramBotId: string;
    status: 'registering' | 'registered' | 'failed';
    fingerprint?: string;
    lastError?: string;
  }): Promise<{ matched: boolean }>;

  loadForRegistration(telegramBotId: string): Promise<{
    encryptedCredentials: Record<string, unknown>;
    webhookRegistration?: WebhookRegistrationStateSnapshot;
  } | null>;
}
