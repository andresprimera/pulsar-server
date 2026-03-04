export interface InstagramServerConfig {
  apiHost: string;
  apiVersion: string;
  webhookVerifyToken: string;
  appSecret?: string;
}

export function loadInstagramConfig(): InstagramServerConfig {
  return {
    apiHost: process.env.INSTAGRAM_API_HOST || 'https://graph.facebook.com',
    apiVersion: process.env.INSTAGRAM_API_VERSION || 'v24.0',
    webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'dev',
    appSecret: process.env.INSTAGRAM_APP_SECRET,
  };
}

export function buildMessagesUrl(config: InstagramServerConfig): string {
  return `${config.apiHost}/${config.apiVersion}/me/messages`;
}
