# Implementation Plan: LLM Config Only on Client (Verification & Tests)

## 1. Feature Overview

**Goal:** LLM configuration (provider, apiKey, model) lives only on the Client document as an optional `llmConfig` field. The client-agent document must not embed LLM config on any channel (`HireChannelConfig` has no `llmConfig`). The catalog **Agent** document (`agents` collection) must not define a per-template LLM override (`llmOverride` removed from schema and agents DTOs). At runtime, agent context resolves LLM from `client.llmConfig` when present and valid (apiKey set and not sentinel `REPLACE_ME`), otherwise from environment (e.g. `OPENAI_API_KEY`) and optional client-level preferences (`llmPreferences`). `AgentContextService` does not read the Agent record for provider/model. Create/update flows for client-agents and onboarding must not accept or persist `llmConfig` per channel. API responses and persisted documents must never expose per-channel LLM config; client `llmConfig.apiKey` is never returned by normal client APIs (`select: false`; only `findByIdWithLlmCredentials` when building agent context).

**Expected behavior:**
- Client: optional `llmConfig` (provider, apiKey, model); apiKey stored encrypted; not returned by normal APIs.
- Catalog Agent: no `llmOverride` in `agent.schema.ts`, `agent.entity.ts`, or agents feature DTOs; agents API does not accept or return LLM override fields.
- ClientAgent channels: no `llmConfig` in schema, DTOs, or API responses.
- Context resolution: client → `client.llmConfig` when valid, else env + `client.llmPreferences` or defaults (openai, gpt-4o).
- Onboarding: may accept optional `client.llmConfig`; channels never include `llmConfig`.
- Seed data and tests: no `llmConfig` inside channels; optional at client level only; tests assert persistence shape and context resolution.

**Affected users/systems:** API consumers (onboarding, client-agents, **agents catalog**), seeder, orchestrator/agent context path.

**Design protocol:** The underlying design (LLM config on Client only, resolution in agent layer) is already justified in `docs/plans/llm-config-per-client.md` (Concern Classification, Alternative Layer Rejection, Future Evolution Simulation, Contract Alignment, Dependency Impact). This document is a verification-and-test plan; no new structural change is introduced.

---

## 2. Architecture Impact

| Layer            | Impact |
|------------------|--------|
| Domain           | No change (LLM config is execution/storage concern). |
| Persistence      | Client has optional `llmConfig` (select: false); HireChannelConfig has no `llmConfig`; ClientRepository has `findByIdWithLlmCredentials`. |
| Agent            | AgentContextService resolves LLM from client then env; returns `{ context, client }`; enrichContext(context, client?). |
| Orchestrator     | Passes client from buildContextFromRoute into enrichContext (single client load). |
| Service (features)| OnboardingService sets client.llmConfig from DTO only; ClientAgentsService and OnboardingService do not write llmConfig to channels. |
| API / DTOs       | ClientDto has optional llmConfig (onboarding); HireChannelConfigDto in both onboarding and client-agents has no llmConfig. CreateAgentDto / UpdateAgentDto have no llmOverride. |

### Affected Components

| Type          | Component | Required change |
|---------------|-----------|-----------------|
| Schemas       | `client.schema.ts` | Verify already correct; no change. Optional llmConfig (LlmConfigSchema, select: false). |
| Schemas       | `client-agent.schema.ts` (HireChannelConfig) | Verify already correct; no change. No llmConfig field. |
| Schemas       | `agent.schema.ts` | No `llmOverride` (catalog agent is prompt/template only for LLM purposes). |
| Schemas       | `llm-config.schema.ts` | Verify already correct; no change. apiKey has select: false. |
| Repositories  | `client.repository.ts` | Verify already correct; no change. findByIdWithLlmCredentials(id) exists. |
| Services      | `AgentContextService` | Verify already correct; no change. buildContextFromRoute loads client via findByIdWithLlmCredentials, resolves from client.llmConfig or env (does not read Agent.llmOverride); returns { context, client }; enrichContext(context, client?). |
| Services      | `IncomingMessageOrchestrator` | Verify already correct; no change. Passes client from buildContextFromRoute to enrichContext. |
| Services      | `OnboardingService` | Verify already correct; no change. Sets client.llmConfig from DTO; hireChannels do not include llmConfig. |
| Services      | `ClientAgentsService` | Verify already correct; no change. create() does not add llmConfig to channel objects. |
| DTOs          | `register-and-hire.dto.ts` | Verify already correct; no change. ClientDto has optional llmConfig; HireChannelConfigDto has no llmConfig. |
| DTOs          | `create-client-agent.dto.ts` | Verify already correct; no change. HireChannelConfigDto has no llmConfig. |
| DTOs          | `create-agent.dto.ts`, `update-agent.dto.ts` | No llmOverride; agents API aligns with client-only LLM resolution. |
| Seed           | `seed-data.json` | Verify already correct; no change. Optional client.llmConfig only (first user); no llmConfig in agentHirings[].channels. |
| Seed           | `seeder.service.ts` | Verify already correct; no change. Passes client.llmConfig from userSeed.client; channelsDto and additionalChannels do not include llmConfig. |
| Entity/type    | `client.entity.ts` (if used for API response typing) | Verify already correct; no change. llmConfig optional; apiKey optional; normal APIs do not return it. |
| Entity/type    | `agent.entity.ts` | No llmOverride on catalog Agent type. |
| Controllers   | OnboardingController, any ClientAgents controller | No change. DTOs and schema ensure no per-channel llmConfig in request or response. |
| Controllers   | AgentsController | Request/response shapes match DTOs without llmOverride. |
| Tests         | AgentContextService spec, onboarding e2e, orchestrator spec | Verify coverage; add or tighten assertions per verification steps below. |

---

## 3. Domain Changes

**None.** LLM config remains execution/storage concern. No domain entities or rules change.

---

## 4. Persistence Changes

**Verified current state (no code change required):**

- **Client schema (`client.schema.ts`):** Optional `llmConfig` with `LlmConfigSchema`, `select: false`. apiKey is inside embedded schema with `select: false` in `llm-config.schema.ts`; whole client `llmConfig` is also `select: false`, so normal `findById` does not return it.
- **HireChannelConfig (`client-agent.schema.ts`):** No `llmConfig` field. No change.
- **ClientRepository:** `findByIdWithLlmCredentials(id)` exists and uses `.select('+llmConfig.apiKey')` for context building only.
- **Indexes / migrations:** None required.

---

## 5. Service Layer Changes

**Verified current state (no code change required):**

- **AgentContextService:** buildContextFromRoute loads client via findByIdWithLlmCredentials; resolves LLM from client.llmConfig when apiKey present and not `REPLACE_ME`, else env + llmPreferences/defaults; does not read channelConfig.llmConfig; returns `{ context, client }`; enrichContext(context, client?) uses passed client when provided.
- **IncomingMessageOrchestrator:** Destructures `{ context, client }` from buildContextFromRoute and calls enrichContext(rawContext, client).
- **OnboardingService:** Sets clientPayload.llmConfig from dto.client.llmConfig (encrypted); hireChannels never include llmConfig.
- **ClientAgentsService:** create() builds channels without llmConfig.

---

## 6. API / Controller Changes

**Verified current state (no code change required):**

- Onboarding: RegisterAndHireDto has ClientDto with optional llmConfig; channels use HireChannelConfigDto without llmConfig. Request body must not accept llmConfig per channel (DTO has no such property; if ValidationPipe uses forbidNonWhitelisted, unknown channel properties would be rejected).
- Client-agents: CreateClientAgentDto channels have no llmConfig. Response is repository/schema-based; HireChannelConfig has no llmConfig, so GET list/detail never return llmConfig on channels.
- Client GET: Normal findById does not select llmConfig, so client API responses do not expose llmConfig (or apiKey).

---

## 7. Integration Points

- **Env fallback:** When client has no llmConfig or apiKey is missing/`REPLACE_ME`, use `process.env.OPENAI_API_KEY` with provider/model from llmPreferences or defaults (openai, gpt-4o). No new env vars.
- No other integration changes.

---

## 8. Migration Considerations

- No migration scripts. Existing data: if any legacy channel had llmConfig stored, schema no longer defines it; it would be ignored and not returned. Dropping and reseeding is the stated approach in docs/plans/llm-config-per-client.md.
- Backward compatibility: not required; per-channel llmConfig abandoned.
- Rollout: Ensure seed and any manual data use client-level llmConfig only.

---

## 9. Testing Strategy

- **Unit**
  - **AgentContextService:** Already has buildContextFromRoute tests: (1) client with valid llmConfig → use it; (2) client with no llmConfig → env fallback; (3) client.llmConfig.apiKey is REPLACE_ME → env fallback. Add (optional) **defensive test:** assert that buildContextFromRoute **never reads** channelConfig.llmConfig—e.g. pass a channelConfig with a fake llmConfig and assert resolution still comes from client or env (not from channel). This catches any future schema mistake where llmConfig might be added to channel config.
  - **OnboardingService:** If unit tests exist, assert registerAndHire with client.llmConfig sets Client.llmConfig and channels have no llmConfig.
  - **ClientAgentsService:** If unit tests exist, assert create with channels produces ClientAgent with channels that have no llmConfig.
- **E2E**
  - **Onboarding e2e:** Already asserts savedClientAgent.channels[0].llmConfig is undefined; one test sends client.llmConfig. Add (optional): explicit assertion that GET /client-agents/client/:id response items have no llmConfig on any channel.
  - **GET client-agents e2e:** Add (or verify existing) e2e assertion that GET client-agents response channels do not include llmConfig, mirroring the existing onboarding e2e assertion.
  - **Client-agents e2e (if any):** Assert create payload channels do not include llmConfig; assert GET list/detail responses have no llmConfig on channels.
- **Seeder:** No test change required if seed-data and seeder already omit per-channel llmConfig; optional: unit or e2e that after seed, ClientAgent documents have no llmConfig on channels and Client may have optional llmConfig.

---

## 10. Implementation Steps (Verification and Test Hardening)

Implementation is **already complete**. The following steps are **verification and optional test hardening** in dependency order.

1. **Verify persistence shape**
   - Confirm `client.schema.ts`: optional `llmConfig` (LlmConfigSchema, select: false).
   - Confirm `client-agent.schema.ts`: HireChannelConfig has no `llmConfig` (and no import of LlmConfigSchema for channels).
   - Confirm `agent.schema.ts`: no `llmOverride` on catalog Agent.
   - Confirm `llm-config.schema.ts`: apiKey has select: false.

2. **Verify repository**
   - Confirm `client.repository.ts`: findByIdWithLlmCredentials(id) exists and uses .select('+llmConfig.apiKey').

3. **Verify agent context resolution**
   - Confirm `agent-context.service.ts`: buildContextFromRoute uses client from findByIdWithLlmCredentials; resolution uses client.llmConfig when apiKey present and not REPLACE_ME, else env + llmPreferences/defaults; no reference to channelConfig.llmConfig or to Agent document fields for provider/model; return type is { context, client }; enrichContext(context, client?) implemented.
   - Confirm `incoming-message.orchestrator.ts`: calls enrichContext(rawContext, client) with client from buildContextFromRoute.

4. **Verify DTOs**
   - Confirm `register-and-hire.dto.ts`: ClientDto has optional llmConfig; HireChannelConfigDto (and channels array) has no llmConfig.
   - Confirm `create-client-agent.dto.ts`: HireChannelConfigDto has no llmConfig.
   - Confirm `create-agent.dto.ts` and `update-agent.dto.ts`: no `llmOverride` (agents API does not configure LLM execution).

5. **Verify services do not write llmConfig to channels**
   - Confirm `onboarding.service.ts`: clientPayload.llmConfig set from dto.client.llmConfig only; hireChannels.push(...) object does not include llmConfig.
   - Confirm `client-agents.service.ts`: channels.push(...) in create() does not include llmConfig.

6. **Verify seed data and seeder**
   - Confirm `seed-data.json`: no llmConfig inside any agentHirings[].channels; optional client.llmConfig only (e.g. first user).
   - Confirm `seeder.service.ts`: clientPayload.llmConfig set from userSeed.client.llmConfig when present; channelsDto and additionalChannels do not include llmConfig.

7. **API response verification**
   - Confirm that **normal Client GET endpoints** (e.g. findById, list) **do not use** findByIdWithLlmCredentials and therefore **do not return** llmConfig or llmConfig.apiKey.
   - Confirm that any other GET returning Client does not use findByIdWithLlmCredentials (so llmConfig is not returned).
   - Confirm that GET client-agents list/detail return repository documents; since HireChannelConfig schema has no llmConfig, response channels never include llmConfig. Optionally add e2e assertion: for a created ClientAgent, GET response channels have no llmConfig property.

8. **Test assertions (add or update as needed)**
   - **AgentContextService spec:** Optionally add a **defensive test** that buildContextFromRoute **never reads** channelConfig.llmConfig: e.g. pass channelConfig with a fake llmConfig and assert resolution comes from client or env (not from channel), so any future schema mistake is caught.
   - **Onboarding e2e:** Already has expect(savedClientAgent.channels[0].llmConfig).toBeUndefined(). Optionally add: after GET /client-agents/client/:id, assert for each item that every channel has no llmConfig: listResponse.body.forEach(ca => ca.channels?.forEach(ch => expect(ch.llmConfig).toBeUndefined())).
   - **GET client-agents e2e:** Add an e2e assertion (or verify existing) that **GET client-agents** response channels **do not include llmConfig**, mirroring the existing onboarding e2e assertion (e.g. after creating or fetching client-agents, assert for each item that ca.channels have no llmConfig).
   - **Client-agents (if e2e exists):** Assert create request channels do not include llmConfig; assert GET response channels have no llmConfig.

9. **Sentinel consistency (optional)**
   - **Option (a):** seed-data.json may be aligned to use the sentinel value `"REPLACE_ME"` for apiKey for clarity (design doc uses REPLACE_ME; code uses .includes('REPLACE_ME') so both work).
   - **Option (b):** Document that `__REPLACE_ME_API_KEY__` in seed-data.json is intentional and triggers env fallback via .includes('REPLACE_ME'). No code change required.

10. **Lint and architecture**
    - Run backend lint and architecture tests; ensure no violations.

---

## 11. Verification Checklist (Final)

- [ ] Client document: optional llmConfig only; apiKey not in normal API responses (select: false; findByIdWithLlmCredentials only for context). Normal Client GET endpoints (findById, list) do not use findByIdWithLlmCredentials and therefore do not return llmConfig or llmConfig.apiKey.
- [ ] ClientAgent document: channels have no llmConfig in schema, persistence, or API.
- [ ] DTOs: no llmConfig on HireChannelConfigDto (onboarding and client-agents); ClientDto may have optional llmConfig (onboarding).
- [ ] OnboardingService: writes client.llmConfig from DTO; never writes llmConfig to hireChannels.
- [ ] ClientAgentsService: never writes llmConfig to channels in create (or update, if applicable).
- [ ] Catalog Agent: `agent.schema.ts` and `agent.entity.ts` have no llmOverride; agents create/update DTOs do not accept it.
- [ ] AgentContextService: resolves LLM from client then env; never uses channelConfig.llmConfig or Agent-level LLM overrides; returns { context, client }; enrichContext accepts optional client.
- [ ] Orchestrator: single client load; passes client to enrichContext.
- [ ] Seed data: no llmConfig in channels; optional client.llmConfig.
- [ ] Seeder: does not add llmConfig to any channel; passes client.llmConfig to onboarding when present.
- [ ] Tests: assert no per-channel llmConfig in saved ClientAgent; assert context resolution from client/env.

---

## 12. Summary

The codebase **already implements** the requirement, including **no per-agent LLM override** on the catalog Agent model or `/agents` API. This plan is a **verification-and-test** plan: confirm persistence shape, DTOs, resolution logic, seed data, and API behavior; add or update tests to explicitly assert no per-channel llmConfig and context resolution from client/env only. No schema, repository, or service logic changes are required unless verification uncovers a discrepancy.

**Files to verify (no change expected):**
- `backend/src/core/persistence/schemas/client.schema.ts`
- `backend/src/core/persistence/schemas/client-agent.schema.ts`
- `backend/src/core/persistence/schemas/agent.schema.ts`
- `backend/src/core/persistence/schemas/llm-config.schema.ts`
- `backend/src/core/persistence/repositories/client.repository.ts`
- `backend/src/core/agent/agent-context.service.ts`
- `backend/src/core/orchestrator/incoming-message.orchestrator.ts`
- `backend/src/features/onboarding/dto/register-and-hire.dto.ts`
- `backend/src/features/onboarding/onboarding.service.ts`
- `backend/src/features/client-agents/dto/create-client-agent.dto.ts`
- `backend/src/features/client-agents/client-agents.service.ts`
- `backend/src/core/persistence/data/seed-data.json`
- `backend/src/core/persistence/seeder.service.ts`
- `backend/src/core/persistence/entities/client.entity.ts` (if present)
- `backend/src/core/persistence/entities/agent.entity.ts`
- `backend/src/features/agents/dto/create-agent.dto.ts`
- `backend/src/features/agents/dto/update-agent.dto.ts`

**Tests to verify or extend:**
- `backend/src/core/agent/agent-context.service.spec.ts`
- `backend/test/onboarding.e2e-spec.ts`
- `backend/test/agents.e2e-spec.ts` (must not assert `llmOverride` on create/patch; catalog agents do not expose LLM override)
- Any client-agents e2e or unit specs
