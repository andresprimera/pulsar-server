export const DEFAULT_TIKTOK_API_BASE_URL =
  'https://business-api.tiktok.com/open_api/v1.2';

export interface TikTokServerConfig {
  apiBaseUrl: string;
}

export const loadTikTokConfig = (): TikTokServerConfig => {
  return {
    apiBaseUrl: process.env.TIKTOK_API_BASE_URL || DEFAULT_TIKTOK_API_BASE_URL,
  };
};

export const buildMessagesUrl = (config: TikTokServerConfig): string => {
  return `${config.apiBaseUrl}/message/send/`;
};
