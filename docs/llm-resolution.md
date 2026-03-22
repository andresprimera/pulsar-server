# LLM credentials and model selection

This document describes **current** runtime behavior for choosing provider, API key, and model when the agent layer handles a message. For historical design rationale and migration notes, see `docs/plans/llm-config-per-client.md` and `docs/plans/llm-config-client-only-implementation.md`.

## Resolution order

`AgentContextService.buildContextFromRoute` sets `AgentContext.llmConfig` as follows:

1. **Client `llmConfig`** — If the hiring client has `llmConfig` with a non-empty `apiKey` that is not the `REPLACE_ME` sentinel, use that document’s `provider`, `model`, and decrypted `apiKey`.
2. **Environment + preferences** — Otherwise use `process.env.OPENAI_API_KEY` as the key, with `provider` / `model` from `client.llmPreferences` when set, or defaults **openai** / **gpt-4o**.

## What does *not* affect LLM settings

- **HireChannelConfig** — No `llmConfig` on channels; channel payloads must not carry LLM credentials.
- **Catalog Agent** (`agents` collection, `/agents` API) — No `llmOverride` (removed). Agent templates supply `systemPrompt`, name, quotas, etc.; they do **not** override provider, model, or API key for execution. Any legacy `llmOverride` key left in old MongoDB documents is ignored by the schema and is not read by `AgentContextService`.

## Where to configure LLM for a customer

- **Onboarding** — Optional `client.llmConfig` on the client payload.
- **Client APIs** — Client-level `llmConfig` / `llmPreferences` (see persistence and client feature modules).

Frontend and API clients should configure LLM at the **client** level, not on agent templates or channels.
