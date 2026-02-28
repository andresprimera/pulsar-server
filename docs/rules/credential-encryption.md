# Credential & Encryption Rules

## Encryption at Rest
- All API keys and credentials MUST be encrypted before storage using `encrypt()` / `encryptRecord()` from `src/database/utils/crypto.util.ts`
- Credential fields in schemas MUST use `select: false` to prevent accidental exposure
- Queries that need credentials MUST explicitly `.select('+fieldName')`

### Example — Schema
```typescript
@Prop({ type: Object, required: true, select: false })
credentials: Record<string, any>;

@Prop({ required: true, select: false })
apiKey: string;
```

### Example — Repository query that needs credentials
```typescript
async findActiveByPhoneNumberId(phoneNumberId: string): Promise<ClientAgent[]> {
  return this.model
    .find({
      status: 'active',
      channels: { $elemMatch: { status: 'active', phoneNumberId } },
    })
    .select('+channels.credentials +channels.llmConfig.apiKey')
    .exec();
}
```

### Example — Encrypting before storage (service layer)
```typescript
channels.push({
  credentials: encryptRecord(channelConfig.credentials),
  llmConfig: {
    ...channelConfig.llmConfig,
    apiKey: encrypt(channelConfig.llmConfig.apiKey),
  },
});
```

## Unencrypted Routing Keys

Channel routing identifiers are stored **unencrypted** alongside encrypted credentials for fast DB lookups. This is intentional — these keys are not secrets, they are identifiers needed for query indexing.

- `phoneNumberId` — WhatsApp routing
- `tiktokUserId` — TikTok routing
- `instagramAccountId` — Instagram routing

These are extracted from `credentials` **before** encryption and stored at the top level of the embedded `HireChannelConfig` document with `index: true`.

### Example — Extracting routing keys before encryption
```typescript
let phoneNumberId: string | undefined;
if (channelConfig.credentials && 'phoneNumberId' in channelConfig.credentials) {
  phoneNumberId = channelConfig.credentials.phoneNumberId;
}

channels.push({
  credentials: encryptRecord(channelConfig.credentials), // encrypted
  phoneNumberId,  // unencrypted, indexed
});
```

## Crypto Utility Reference

**File:** `src/database/utils/crypto.util.ts`

| Function | Purpose |
|----------|---------|
| `encrypt(text)` | Encrypt a single string (AES-256-GCM) |
| `decrypt(payload)` | Decrypt a single string |
| `encryptRecord(record)` | Encrypt all string values in an object (shallow) |
| `decryptRecord(record)` | Decrypt values matching encrypted format |
| `isEncryptedPayload(value)` | Check if a string looks like an encrypted payload |

**Behavior by environment:**
- `NODE_ENV !== 'production'` → returns plaintext (no encryption)
- `NODE_ENV === 'production'` → encrypts using `SECRET_ENCRYPTION_KEY` env var
