# Credential Encryption Rules

ARCHITECTURE_CONTRACT.md has higher priority.

## Mandatory

- Encrypt API keys and secret credentials at rest.
- Sensitive credential fields must default to select: false.
- Read paths must explicitly opt-in with .select('+...').
- Decrypt only at execution boundary.

## Routing Identifiers

- Routing keys (phoneNumberId, instagramAccountId, etc.) may remain plaintext.
- Secret tokens must always remain encrypted.

## Telegram webhook verification material (`telegramWebhookSecretHex`)

- The Telegram **bot token** stays inside encrypted `HireChannelConfig.credentials` (for example under a `botToken` key).
- At hire (and whenever the token is set), the system also stores **`telegramWebhookSecretHex`**: `SHA-256(UTF-8(botToken))` as lowercase hex (see `deriveTelegramWebhookSecret` in `telegram-webhook-secret.util.ts`). This is **verification material for inbound webhooks**, not a substitute for encrypting the token at rest.
- Inbound webhook auth compares the provider header to `telegramWebhookSecretHex` only — **no decrypt** of `credentials` on that path. Repository queries for that path must not use `.select('+channels.credentials')`.

## Environment Behavior

- Non-production may allow relaxed behavior for ergonomics.
- Production must use SECRET_ENCRYPTION_KEY.

## Boundary Rule

- Decryption must occur only:
  - In channel layer (before outbound send)
  - Or at LLM execution boundary

Never decrypt in domain or persistence layers.