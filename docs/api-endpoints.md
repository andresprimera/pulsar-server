# API Endpoints Reference

Base URL: `http://localhost:3000` (no global prefix).  
IDs in paths are MongoDB ObjectIds unless noted.  
Status filters where applicable: `active` | `inactive` | `archived`.

---

## Health

| Method | Path  | Body | Response    |
|--------|-------|------|-------------|
| GET    | `/`   | -    | Empty string |

---

## Agents

**Base path:** `/agents`

| Method | Path                  | Query     | Body / Notes |
|--------|-----------------------|------------|--------------|
| POST   | `/agents`             | -          | `name`, `systemPrompt` (required); optional `llmOverride` (`provider`: `openai` \| `anthropic`, `model`), optional `monthlyTokenQuota` (int ≥ 0 or null) |
| GET    | `/agents`             | `status?`  | Optional: `active`, `inactive`, `archived` |
| GET    | `/agents/available`   | -          | Returns active agents only |
| GET    | `/agents/:id`        | -          | - |
| PATCH  | `/agents/:id`        | -          | Optional: `name`, `systemPrompt`, `llmOverride`, `monthlyTokenQuota` |
| PATCH  | `/agents/:id/status` | -          | Body: `status` (`active` \| `inactive` \| `archived`). Archived agents cannot be modified |

Response: `_id`, `name`, `systemPrompt`, `status`, optional `llmOverride`, `monthlyTokenQuota`, timestamps.

---

## Clients

**Base path:** `/clients`

| Method | Path                    | Query     | Body / Notes |
|--------|-------------------------|------------|--------------|
| POST   | `/clients`              | -          | `name` (required); optional `billingCurrency` (ISO 4217), optional `brandVoice` (client tone/style instructions) |
| GET    | `/clients`              | `status?`  | Optional: `active`, `inactive`, `archived` |
| GET    | `/clients/:id`          | -          | - |
| PATCH  | `/clients/:id`          | -          | Optional: `name`, `billingCurrency`, `brandVoice` |
| PATCH  | `/clients/:id/status`   | -          | Body: `status` |

Response: client document (`_id`, `name`, `type`, `status`, `billingCurrency`, `billingAnchor`, optional `brandVoice`, etc.). When set, `brandVoice` is injected into the agent prompt alongside personality.

---

## Users

**Base path:** `/users`

| Method | Path                    | Query     | Body / Notes |
|--------|-------------------------|------------|--------------|
| POST   | `/users`                | -          | `email`, `name`, `clientId` (MongoId) |
| GET    | `/users`                | `status?`  | Optional: `active`, `inactive`, `archived` |
| GET    | `/users/available`      | -          | Active users only |
| GET    | `/users/:id`            | -          | - |
| PATCH  | `/users/:id`            | -          | Optional: `email`, `name` |
| PATCH  | `/users/:id/status`     | -          | Body: `status` |

---

## Personalities

**Base path:** `/personalities`

| Method | Path                         | Query     | Body / Notes |
|--------|------------------------------|------------|--------------|
| POST   | `/personalities`             | -          | `name`, `description`, `promptTemplate` (required); optional `tone`, `communicationStyle`, `examplePhrases` (string[]), `guardrails` |
| GET    | `/personalities`             | `status?`  | Optional: `active`, `inactive`, `archived` |
| GET    | `/personalities/available`   | -          | Returns active personalities only |
| GET    | `/personalities/:id`         | -          | - |
| PATCH  | `/personalities/:id`         | -          | Optional: `name`, `description`, `tone`, `communicationStyle`, `examplePhrases`, `guardrails`, `promptTemplate` |
| PATCH  | `/personalities/:id/status`  | -          | Body: `status` (`active` \| `inactive` \| `archived`). Archived cannot be modified |

Response: `_id`, `name`, `description`, `tone`, `communicationStyle`, `examplePhrases`, `guardrails`, `promptTemplate`, `status`, `version`, timestamps.

---

## Channels (read-only)

**Base path:** `/channels`

Channels are created via seed; only listing and single-item retrieval are available.

| Method | Path             | Body / Notes |
|--------|------------------|--------------|
| GET    | `/channels`      | -            |
| GET    | `/channels/:id`  | -            |

Response: `_id`, `name`, `type` (e.g. whatsapp, tiktok, instagram), `supportedProviders[]`, `monthlyMessageQuota`.

---

## Agent prices (nested under agents)

**Base path:** `/agents/:agentId/prices`

| Method | Path                                            | Body / Notes |
|--------|-------------------------------------------------|--------------|
| PUT    | `/agents/:agentId/prices/:currency`             | Body: `amount` (number ≥ 0). `currency`: 3-letter ISO 4217 (e.g. USD) |
| GET    | `/agents/:agentId/prices`                       | - |
| PATCH  | `/agents/:agentId/prices/:currency/deprecate`   | No body. Marks price as deprecated |

Response (list): `agentId`, `currency`, `amount`, `status` (`active` \| `deprecated`).

---

## Channel prices (nested under channels)

**Base path:** `/channels/:channelId/prices`

| Method | Path                                               | Body / Notes |
|--------|----------------------------------------------------|--------------|
| PUT    | `/channels/:channelId/prices/:currency`            | Body: `amount` (number ≥ 0) |
| GET    | `/channels/:channelId/prices`                      | - |
| PATCH  | `/channels/:channelId/prices/:currency/deprecate`  | No body |

Note: `channelId` must reference an existing channel (use GET `/channels` or GET `/channels/:id` to list or look up channels).

---

## Client-agents

**Base path:** `/client-agents`

| Method | Path                                  | Body / Notes |
|--------|---------------------------------------|--------------|
| POST   | `/client-agents`                      | `clientId`, `agentId`, `personalityId` (MongoIds); optional `pricingOverride` (`agentAmount`, `agentMonthlyTokenQuota`); `channels[]`: each with `channelId`, `provider` (`meta` \| `twilio` \| `tiktok` \| `instagram` \| `dialog360`), `credentials`, `llmConfig` (`provider`, `apiKey`, `model`), optional `amountOverride`, `monthlyMessageQuotaOverride` |
| GET    | `/client-agents/client/:clientId`     | - |
| PATCH  | `/client-agents/:id`                  | Optional: `personalityId` only (pricing is snapshotted at hire) |
| PATCH  | `/client-agents/:id/status`           | Body: `status` |
| GET    | `/client-agents/billing/client/:clientId` | Returns total amount and currency for active client-agents |

---

## Onboarding

**Base path:** `/onboarding`

| Method | Path                               | Body / Notes |
|--------|------------------------------------|--------------|
| POST   | `/onboarding/register-and-hire`    | `user` (`email`, `name`), `client` (`type`: `individual` \| `organization`, optional `name`, `billingCurrency`), `agentHiring` (`agentId`, `personalityId`, optional `pricingOverride`), `channels[]` (same shape as client-agents; optional `credentials`, `routingIdentifier`). Creates user, client, and client-agent. Returns 201. |

---

## Collections without REST API

None; channels now support GET (list and by id). Channels are still created via seed (no POST/PATCH/DELETE).
