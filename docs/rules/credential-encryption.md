# Credential Encryption Rules

`docs/rules/ARCHITECTURE_CONTRACT.md` has higher priority than this file.

## Mandatory
- Encrypt API keys and secret credentials at rest using the shared crypto utility.
- Sensitive credential fields must default to `select: false`.
- Any read path that needs credentials must explicitly opt in with `.select('+...')`.
- Decrypt only at execution boundary where the secret is required.

## Routing identifiers
- Routing keys used for lookup/indexing may remain unencrypted.
- Only non-secret identifiers are allowed in unencrypted routing fields.
- Keep secret tokens/keys encrypted even when adjacent routing identifiers are plaintext.

## Environment behavior
- Non-production may return plaintext for local/dev ergonomics.
- Production must encrypt/decrypt using `SECRET_ENCRYPTION_KEY`.
