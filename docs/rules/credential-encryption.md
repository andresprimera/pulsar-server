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

## Environment Behavior

- Non-production may allow relaxed behavior for ergonomics.
- Production must use SECRET_ENCRYPTION_KEY.

## Boundary Rule

- Decryption must occur only:
  - In channel layer (before outbound send)
  - Or at LLM execution boundary

Never decrypt in domain or persistence layers.