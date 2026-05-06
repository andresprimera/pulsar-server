export const TELEGRAM_WEBHOOK_QUEUE_NAME = 'telegram-webhook-registration';
export const TELEGRAM_WEBHOOK_REGISTER_JOB = 'register';

export interface TelegramWebhookRegisterPayload {
  telegramBotId: string;
}

export interface TelegramWebhookRegisterResult {
  registered: boolean;
  fingerprint: string;
}
