import { Logger } from '@nestjs/common';

const logger = new Logger('EnvValidate');

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv =
    (config.NODE_ENV as string | undefined) ??
    process.env.NODE_ENV ??
    'development';
  const publicBaseUrl =
    (config.PUBLIC_BASE_URL as string | undefined) ??
    process.env.PUBLIC_BASE_URL;

  const isProduction = nodeEnv === 'production';

  if (publicBaseUrl == null || publicBaseUrl === '') {
    if (isProduction) {
      throw new Error(
        'PUBLIC_BASE_URL is required in production (e.g. https://api.example.com).',
      );
    }
    logger.warn(
      'PUBLIC_BASE_URL is not set; Telegram webhook registration will fail until configured.',
    );
    return config;
  }

  if (typeof publicBaseUrl !== 'string') {
    throw new Error('PUBLIC_BASE_URL must be a string');
  }

  // Reject malformed URLs (e.g. "https://exa mple.com") that a regex would
  // accept. WHATWG `URL` parsing catches whitespace, missing host, etc.
  let parsed: URL;
  try {
    parsed = new URL(publicBaseUrl);
  } catch {
    throw new Error(
      `PUBLIC_BASE_URL is not a valid URL (got: ${publicBaseUrl})`,
    );
  }
  if (!parsed.hostname) {
    throw new Error(
      `PUBLIC_BASE_URL must include a hostname (got: ${publicBaseUrl})`,
    );
  }

  if (parsed.protocol !== 'https:') {
    if (isProduction) {
      throw new Error(
        `PUBLIC_BASE_URL must start with https:// in production (got: ${publicBaseUrl})`,
      );
    }
    logger.warn(
      `PUBLIC_BASE_URL does not start with https:// (got: ${publicBaseUrl}); accepted in non-production only.`,
    );
  }
  if (publicBaseUrl.endsWith('/')) {
    if (isProduction) {
      throw new Error(
        `PUBLIC_BASE_URL must not end with '/' (got: ${publicBaseUrl})`,
      );
    }
    logger.warn(
      `PUBLIC_BASE_URL ends with '/' (got: ${publicBaseUrl}); accepted in non-production only.`,
    );
  }

  return config;
}
