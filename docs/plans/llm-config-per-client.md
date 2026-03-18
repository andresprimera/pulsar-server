# Implementation Plan: Move LLM Credentials to Optional Per-Client

## 1. Feature Overview

**Goal:** Move LLM credentials from per-channel (HireChannelConfig) to optional per-client. Every agent a client hires uses the same client-level LLM config. When a client has no config, fall back to `.env` (e.g. `OPENAI_API_KEY`).

**Expected behavior:**
- Client may have an optional `llmConfig` (same shape as current LlmConfig: provider, apiKey, model). No per-channel LLM config.
- At runtime, when building agent context: resolve LLM from `client.llmConfig` first; if missing or apiKey is `REPLACE_ME`/missing, use `process.env.OPENAI_API_KEY`.
- Onboarding and client-agent APIs accept optional client-level LLM config; channel DTOs no longer include `llmConfig`.
- Seed data: LLM config only at client level (or omitted for env fallback); no `llmConfig` per channel in `agentHirings`.

**Affected users/systems:** Backend API consumers (onboarding, client-agents), seeder, and the orchestrator/agent path that builds `AgentContext`.

---

## 2. Architecture Impact

| Layer            | Impact |
|-----------------|--------|
| Domain           | No change (LLM config is execution/storage concern, not business invariant). |
| Persistence      | Client schema + optional `llmConfig`; HireChannelConfig schema minus `llmConfig`; ClientRepository new method for loading client with credentials; seed data shape change. |
| Service (agent)  | AgentContextService resolves LLM from client then env; returns client for reuse in enrichContext; enrichContext accepts optional client. |
| Service (orchestrator) | IncomingMessageOrchestrator passes client from buildContextFromRoute into enrichContext to avoid duplicate client load. |
| Service (onboarding / client-agents) | OnboardingService and ClientAgentsService stop writing `llmConfig` per channel; OnboardingService may set `client.llmConfig` from DTO. |
| API / Controllers | DTOs: RegisterAndHireDto (ClientDto gains optional llmConfig, HireChannelConfigDto loses llmConfig); CreateClientAgentDto (HireChannelConfigDto loses llmConfig). |

**Affected components**

| Type        | Component |
|------------|-----------|
| Schemas    | `Client` (client.schema.ts), `HireChannelConfig` (client-agent.schema.ts), `LlmConfig` (llm-config.schema.ts — reused, not moved). |
| Repositories | `ClientRepository` (new method to load client with llm credentials for context). |
| Services   | `AgentContextService`, `IncomingMessageOrchestrator`, `OnboardingService`, `ClientAgentsService`. |
| DTOs       | RegisterAndHireDto + nested UserDto, ClientDto, HireChannelConfigDto; CreateClientAgentDto + nested HireChannelConfigDto, LlmConfigDto (onboarding: keep for ClientDto; client-agents: remove from channel, optionally reuse for client elsewhere if needed). |
| Controllers | OnboardingController, ClientAgentsController (no signature change; DTOs change). |
| Seed / data | `seed-data.json` (client-level optional llmConfig; remove llmConfig from each channel in agentHirings); `SeederService`. |
| Tests      | AgentContextService spec, OnboardingService spec, onboarding e2e, client-agents e2e, SeederService spec (if it asserts channel llmConfig). |

### Design decisions / clarifications

- **llmPreferences vs llmConfig**  
  `Client.llmPreferences` (existing: provider, defaultModel), if present, **remains** unchanged. **Single resolution rule:** Use `client.llmConfig` when present and `client.llmConfig.apiKey` is set and not the `REPLACE_ME` sentinel (then decrypt and use provider, model, apiKey). Otherwise use env fallback: `process.env.OPENAI_API_KEY` with provider and model taken from `client.llmPreferences` when present, or fixed defaults (openai, gpt-4o). No mixing: when llmConfig is used, it fully supplies provider/model/apiKey; when env is used, provider/model come from llmPreferences or defaults.

- **Default provider/model on env fallback**  
  When using `process.env.OPENAI_API_KEY`, provider and model default to the **same values as today**: **openai** and **gpt-4o**, so behavior is consistent with current env-based usage.

- **REPLACE_ME sentinel**  
  The string **`REPLACE_ME`** is the defined contract for "use env fallback": if `client.llmConfig.apiKey` is missing or equals `REPLACE_ME`, the system treats it as no client credential and falls back to `process.env.OPENAI_API_KEY`. AgentContextService (and any configuration that references this contract) must use this sentinel consistently; tests may rely on it to assert env fallback behavior.

- **Entity/type for Client**  
  If a shared Client type or entity exists (e.g. `entities/client.entity.ts` or schema-derived type), add optional **`llmConfig?: { provider: string; model: string; apiKey?: string }`**. The **apiKey must never be exposed in normal API responses**; this is already ensured by Mongoose `select: false` on the field and by using the credential only in context building (e.g. `findByIdWithLlmCredentials` used only in AgentContextService). Default `findById` and any public client APIs must not return `llmConfig.apiKey`.

- **Single client load per request**  
  To avoid two client loads per inbound message (one in `buildContextFromRoute` for LLM resolution, one in `enrichContext` for clientName/brandVoice), the implementation must reuse the same client: either (a) have `buildContextFromRoute` return the loaded client together with the context (e.g. `{ context: AgentContext \| null; client: Client \| null }`) and have `enrichContext(context, client?)` accept an optional pre-loaded client and skip `findById` when provided, with the orchestrator passing the client from step (a); or (b) another refactor that ensures a single `findByIdWithLlmCredentials` (or equivalent) per request. This keeps one client read per message and avoids duplicate DB round-trips.

---

## 3. Mandatory Structural Design Protocol

### 3.1 Concern Classification

- **Business Invariant Test** → **FAIL**. LLM config (provider, apiKey, model) does not define business truth or domain policies; it is execution/integration configuration. → Does **not** belong in `domain/`.
- **Execution Concern Test** → **PASS**. LLM config exists for LLM execution, provider integration, and model selection. Resolution and use live in the agent layer (AgentContextService) and execution (AgentService). → Placement in **agent** (resolution) and **persistence** (storage) is correct.
- **Coordination Concern Test** → **FAIL**. LLM config is not about event ordering, idempotency, or conversation resolution. → Does not belong in `orchestrator/`.
- **Storage Concern Test** → **PASS**. Storing optional `llmConfig` on Client and removing it from HireChannelConfig is purely persistence shape. → Belongs in `persistence/`.
- **Transport Concern Test** → **FAIL**. LLM config is not webhook/HTTP/platform I/O. → Does not belong in `channels/`.

**Layer placement:** Persistence stores client-level `llmConfig`; agent layer (AgentContextService) resolves client → env and builds `AgentContext`. No domain or transport change.

### 3.2 Alternative Layer Rejection

- **Domain:** Would contaminate domain with provider/apiKey/model and execution details; .cursorrules forbid encoding provider-specific or infrastructure logic in domain.
- **Orchestrator:** Orchestrator must not decrypt credentials; credential resolution and decryption stay in agent layer (AgentContextService).
- **Channels:** Transport is I/O only; must not build AgentContext or resolve LLM.
- **Persistence:** Already holds the data; no need to move resolution into persistence (repositories do not perform business or execution logic).

### 3.3 Future Evolution Simulation

1. **Future: multiple LLM backends per client (e.g. primary + fallback).**  
   Extend `Client.llmConfig` to an optional array or add `llmConfigFallback` in persistence; resolution logic in AgentContextService grows to try primary then fallback then env. No layer violation; no reclassification.

2. **Future: per-agent override of client LLM model only (no credentials).**  
   Add optional `preferredModel` on ClientAgent or personality; AgentContextService merges client.llmConfig with override for `model` only. Still execution concern in agent layer; persistence only stores extra optional field. No contract change.

### 3.4 Contract Alignment Proof

- **Layer direction:** Orchestrator → agent (buildContextFromRoute); agent → persistence (ClientRepository, no new outward imports). No upward or sideways imports.
- **Domain:** No new domain types or logic; domain remains pure.
- **Idempotency:** Unchanged; no change to event handling or duplicate detection.
- **Summary compression:** Unchanged.
- **Transport:** Channels unchanged; no transport logic added.

### 3.5 Dependency Impact Declaration

- **Layers modified:** Persistence (schemas, ClientRepository), Agent (AgentContextService), and feature modules that own onboarding/client-agents DTOs and services (onboarding, client-agents).
- **New dependencies:** None. AgentContextService already depends on ClientRepository; it will use a new method to load client with llm credentials.
- **Dependency direction:** No change. No new imports from persistence → agent or orchestrator → persistence (beyond existing idempotency).

---

## 4. Domain Changes

**None.** LLM config remains an execution/storage concern. No new domain entities or rules.

---

## 5. Persistence Changes

- **Client schema (`client.schema.ts`):** Add optional `llmConfig` with the same shape as current LlmConfig: embed `LlmConfigSchema`, optional field, `apiKey` with `select: false` (reuse existing LlmConfig schema or inline same shape). Any shared Client entity/type must add `llmConfig?: { provider; model; apiKey? }`; apiKey is never exposed in normal API responses (see Design decisions).
- **HireChannelConfig (client-agent.schema.ts):** Remove `llmConfig` (and the required LlmConfig prop). Remove import of LlmConfigSchema from HireChannelConfig.
- **ClientRepository:** Add `findByIdWithLlmCredentials(clientId: string): Promise<Client | null>` that returns the client document including `llmConfig.apiKey` (e.g. `.select('+llmConfig.apiKey')`) for use only when building agent context. Default `findById` remains unchanged (does not expose apiKey).
- **Indexes:** No new indexes. No change to ClientAgent or Client indexes.
- **Migrations:** None (DB drop and reseed per constraints).

---

## 6. Service Layer Changes

- **AgentContextService (`agent-context.service.ts`):**
  - In `buildContextFromRoute(clientAgent, channelConfig)`:
    - Load client via `clientRepository.findByIdWithLlmCredentials(clientAgent.clientId)`.
    - Resolve LLM: if `client?.llmConfig` exists and `client.llmConfig.apiKey` is present and not the **`REPLACE_ME`** sentinel (see Design decisions), use `client.llmConfig` (decrypt apiKey); else use `process.env.OPENAI_API_KEY` with provider/model from `client.llmPreferences` if present, or fixed defaults (openai, gpt-4o).
    - Build `rawContext.llmConfig` from this resolution. Do not read `channelConfig.llmConfig`.
    - Return the loaded client together with the context (e.g. return type `{ context: AgentContext | null; client: Client | null }`) so the orchestrator can pass the client to `enrichContext` and avoid a second client load.
  - In `enrichContext(context, client?)`: add an optional second parameter `client`. When `client` is provided, use it for `clientName` and `brandVoice` and do not call `clientRepository.findById`. When omitted, keep current behavior (load client by `context.clientId`).
  - All other methods unchanged.

- **OnboardingService (`onboarding.service.ts`):**
  - In `registerAndHire`: when creating Client, if DTO provides `client.llmConfig`, set `client.llmConfig` with encrypted apiKey (same encrypt pattern as today for channel llmConfig). When building `hireChannels`, do not include `llmConfig` in any channel entry.
  - Remove all references to `channelConfig.llmConfig` in the channel loop.

- **ClientAgentsService (`client-agents.service.ts`):**
  - In `create`: when building `channels` for `clientAgentRepository.create`, do not include `llmConfig` in each channel. Remove the loop logic that sets `llmConfig` per channel.

---

## 7. API / Controller Changes

- **Onboarding**
  - **RegisterAndHireDto:** Add optional `llmConfig` to `ClientDto` (same shape as current LlmConfigDto: provider, apiKey, model). Remove `llmConfig` from `HireChannelConfigDto`. Export or reuse `LlmConfigDto` for the client-level optional field.
  - **Behavior:** POST body may include `client.llmConfig`; each item in `channels` must not include `llmConfig`.

- **Client-agents**
  - **CreateClientAgentDto:** Remove `llmConfig` from `HireChannelConfigDto`. Remove `LlmConfigDto` from this file if no longer used here (channels no longer carry LLM config).
  - **Behavior:** POST body channels no longer accept `llmConfig`.

- **Controllers:** No route or method signature changes; only DTO shapes change.

---

## 8. Integration Points

- **Env fallback:** When client has no `llmConfig` or apiKey is missing/`REPLACE_ME`, use `process.env.OPENAI_API_KEY` with provider and model defaulting to **openai** and **gpt-4o** (same as today). No new env vars.
- No new external APIs, messaging, or background jobs.

---

## 9. Migration Considerations

- **No migration scripts.** DB is dropped and reseeded.
- **Backward compatibility:** Not required; existing channel-level `llmConfig` is abandoned.
- **Rollout:** After deploy, reseed so Client documents may carry optional `llmConfig` and ClientAgent channels no longer store `llmConfig`.

---

## 10. Testing Strategy

- **Unit**
  - **AgentContextService:** Tests for `buildContextFromRoute`: (1) client has valid `llmConfig` → use it (decrypt apiKey); (2) client has no llmConfig → use env; (3) client.llmConfig.apiKey is REPLACE_ME or missing → use env. Mock `ClientRepository.findByIdWithLlmCredentials` and `AgentRepository`, `PersonalityRepository` as needed.
  - **OnboardingService:** registerAndHire with `client.llmConfig` set → created Client has encrypted llmConfig; channels in created ClientAgent have no llmConfig. registerAndHire without client.llmConfig → Client has no llmConfig.
  - **ClientAgentsService:** create with channels (no llmConfig in DTO) → created ClientAgent channels have no llmConfig.
- **Integration / E2E**
  - Onboarding e2e: adjust payloads to remove `llmConfig` from each channel; optionally add `client.llmConfig` and assert behavior (or rely on env fallback).
  - Client-agents e2e: remove `llmConfig` from channel payloads; ensure create still succeeds and messages still run (env fallback).
- **Seeder:** Unit or e2e: seed-data without per-channel llmConfig; optional client-level llmConfig in seed; assert Client and ClientAgent documents have the new shape.

---

## 11. Implementation Steps (Ordered)

1. **Persistence – Client schema**  
   In `client.schema.ts`, add optional `llmConfig` using the same shape as LlmConfig (provider, apiKey with `select: false`, model). Reuse `LlmConfigSchema` from `llm-config.schema.ts` for consistency.

2. **Persistence – HireChannelConfig**  
   In `client-agent.schema.ts`, remove `llmConfig` and its type/import from `HireChannelConfig`. Keep all other channel fields (channelId, provider, status, credentials, routing keys, amount, currency, monthlyMessageQuota).

3. **Persistence – ClientRepository**  
   Add `findByIdWithLlmCredentials(clientId: string): Promise<Client | null>` that queries by id and selects `+llmConfig.apiKey` so the returned document includes the encrypted apiKey for agent context building only.

4. **Agent – AgentContextService**  
   In `buildContextFromRoute`, load client with `findByIdWithLlmCredentials(clientAgent.clientId)`. Resolve LLM: if `client?.llmConfig` exists and apiKey is present and not the `REPLACE_ME` sentinel, use client.llmConfig (decrypt apiKey); else use `process.env.OPENAI_API_KEY` with provider/model from `client.llmPreferences` if present, or fixed defaults (openai, gpt-4o). Build `rawContext.llmConfig` from this resolution; remove any use of `channelConfig.llmConfig`. Return `{ context: AgentContext | null; client: Client | null }` so the orchestrator can pass the client to `enrichContext`. In `enrichContext(context, client?)`, add optional second parameter `client`; when provided, use it for clientName/brandVoice and do not call `findById`.
4b. **Orchestrator**  
   In `incoming-message.orchestrator.ts`, after `buildContextFromRoute`, destructure `{ context: rawContext, client }` and pass `client` into `enrichContext(rawContext, client)` so only one client load occurs per request.

5. **DTOs – Onboarding**  
   In `register-and-hire.dto.ts`: add optional `llmConfig` to `ClientDto` (LlmConfigDto shape). Remove `llmConfig` from `HireChannelConfigDto`. Keep `LlmConfigDto` in this file for the client-level field.

6. **OnboardingService**  
   In `registerAndHire`, when creating Client, if `dto.client.llmConfig` is provided, set `client.llmConfig` with apiKey encrypted via `encrypt(dto.client.llmConfig.apiKey)`. When building `hireChannels`, omit `llmConfig` from every channel object.

7. **DTOs – Client-agents**  
   In `create-client-agent.dto.ts`, remove `llmConfig` and `LlmConfigDto` from `HireChannelConfigDto`. Remove unused `LlmConfigDto` class if not used elsewhere in this file.

8. **ClientAgentsService**  
   In `create`, when building the `channels` array for `clientAgentRepository.create`, stop adding `llmConfig` to each channel object.

9. **Seed data**  
   In `seed-data.json`, remove `llmConfig` from every channel inside each `agentHirings[].channels` entry. Optionally add a single optional `llmConfig` at the client level (e.g. under `client` for each user) if seed should exercise client-level config; otherwise rely on env fallback.

10. **SeederService**  
    In `seeder.service.ts`, when building `channelsDto` for the first agent hiring (onboarding), remove `llmConfig: channelSeed.llmConfig`. When creating the client via onboarding, pass optional `client.llmConfig` from seed (e.g. from `userSeed.client.llmConfig`) if present, with apiKey encrypted. When building `additionalChannels` for additional hirings, do not include `llmConfig` in each channel object.

11. **Tests**  
    Update AgentContextService unit tests for `buildContextFromRoute` (client llmConfig vs env fallback). Update onboarding and client-agents unit/e2e tests and seeder tests to use the new DTO shape and assert new persistence shape (no llmConfig on channels; optional on Client).

12. **Entity / types**  
    If a shared Client type or entity exists, add optional `llmConfig?: { provider: string; model: string; apiKey?: string }`. Ensure apiKey is never exposed in normal API responses (select: false and usage only in context building; see Design decisions).

---

**Summary of affected files**

| File | Change |
|------|--------|
| `persistence/schemas/client.schema.ts` | Add optional `llmConfig` (LlmConfigSchema). |
| `persistence/schemas/client-agent.schema.ts` | Remove `llmConfig` from HireChannelConfig. |
| `persistence/repositories/client.repository.ts` | Add `findByIdWithLlmCredentials`. |
| `agent/agent-context.service.ts` | Resolve LLM from client then env; return { context, client }; enrichContext(context, client?). |
| `orchestrator/incoming-message.orchestrator.ts` | Pass client from buildContextFromRoute into enrichContext. |
| `features/onboarding/dto/register-and-hire.dto.ts` | ClientDto + optional llmConfig; HireChannelConfigDto − llmConfig. |
| `features/onboarding/onboarding.service.ts` | Set client.llmConfig from DTO; no llmConfig in hireChannels. |
| `features/client-agents/dto/create-client-agent.dto.ts` | Remove llmConfig/LlmConfigDto from HireChannelConfigDto. |
| `features/client-agents/client-agents.service.ts` | Do not add llmConfig to channels in create. |
| `persistence/data/seed-data.json` | Remove per-channel llmConfig; optional client llmConfig. |
| `persistence/seeder.service.ts` | Build channels without llmConfig; pass client.llmConfig to onboarding when present. |
| `agent/agent-context.service.spec.ts` | Tests for buildContextFromRoute with client vs env. |
| Onboarding / client-agents e2e and related specs | Update payloads and assertions. |
