# Context Enrichment Layer

## Overview

`AgentContextService` (`src/agent/agent-context.service.ts`) enriches the `AgentContext` before it reaches `AgentService.run()`. It sits between routing/context-building and agent execution in every channel service.

## Flow

```
Channel Service (builds raw AgentContext)
    ↓
AgentContextService.enrichContext(rawContext)   ← enrichment happens here
    ↓
AgentService.run(input, enrichedContext)
```

## What it does today

- Fetches the `Client` document by `context.clientId`
- Sets `context.clientName` from `client.name`
- Appends to the system prompt:
  - Company identity: `You are representing "{client.name}".`
  - Agent role (if `agentName` provided): `Your role is "{agentName}".`
  - Introduction instruction: `In your first message to a new user, introduce yourself by mentioning the company you represent and your role.`
- If the client is not found, returns the context unchanged (no crash)

## AgentContext interface

```typescript
// src/agent/contracts/agent-context.ts
export interface AgentContext {
  agentId: string;
  agentName?: string;      // passed by channel services from agent.name
  clientId: string;
  clientName?: string;     // set by AgentContextService after client lookup
  channelId: string;
  systemPrompt: string;    // enriched by AgentContextService
  llmConfig: { provider, apiKey, model };
  channelConfig?: Record<string, unknown>;
}
```

## Usage in channel services (REQUIRED)

All channel services MUST call `enrichContext()` before `agentService.run()`:

```typescript
const rawContext: AgentContext = {
  agentId: clientAgent.agentId,
  agentName: agent.name,           // ← pass agent name for enrichment
  clientId: clientAgent.clientId,
  channelId: channelConfig.channelId.toString(),
  systemPrompt: agent.systemPrompt,
  llmConfig: { ... },
  channelConfig: decryptRecord(channelConfig.credentials),
};

const context = await this.agentContextService.enrichContext(rawContext);

const output = await this.agentService.run(input, context);
```

## Adding new enrichments

To add new context (e.g. per-client custom prompts, per-channel instructions):

1. Add the enrichment logic in `AgentContextService.enrichContext()`
2. Add optional fields to `AgentContext` if the data needs to be accessible downstream
3. Update tests in `src/agent/agent-context.service.spec.ts`

Do NOT:
- Enrich context inside channel services — all enrichment goes through `AgentContextService`
- Enrich context inside `AgentService.run()` — keep agent execution decoupled from context resolution
- Add DB calls to `AgentService` for context data — that is the enrichment layer's job

## Module registration

`AgentContextService` is registered in `AgentModule` (`src/agent/agent.module.ts`) and exported for use by channel modules.
