# Pulsar Architecture Contract

This document defines the mandatory architectural rules of the system.

These rules are mechanically enforced via:

-   ESLint boundaries
-   Path aliases
-   CI lint checks
-   Import restrictions
-   Architecture tests

No change may violate this contract.

If any other document conflicts with this one, this document wins.

------------------------------------------------------------------------

# 1. Layer Overview

The system is divided into five strict layers:

1.  Transport Layer (`channels/`)
2.  Coordination Layer (`orchestrator/`)
3.  LLM Execution Layer (`agent/`)
4.  Domain Layer (`domain/`)
5.  Persistence Layer (`persistence/`)

------------------------------------------------------------------------

## 1.1 Allowed Dependency Flow

channels → orchestrator

orchestrator → domain\
orchestrator → agent\
orchestrator → persistence (idempotency only)

agent → domain\
agent → persistence

domain → (no outward dependencies)\
persistence → (no outward dependencies)

Upward or sideways imports are forbidden.

All cross-layer imports must use path aliases:

@channels/* @orchestrator/* @agent/* @domain/* @persistence/* @shared/*

Relative parent imports across layers are forbidden.

------------------------------------------------------------------------

# 2. Transport Layer (`channels/`)

## Responsibilities

-   Webhook validation
-   Signature verification
-   Payload parsing
-   Construct `IncomingChannelEvent`
-   Call `IncomingMessageOrchestrator`
-   Send outbound platform messages

## Transport MUST NOT

-   Import repositories
-   Import persistence layer
-   Import `AgentService`
-   Resolve routing
-   Resolve conversations
-   Persist messages
-   Build `AgentContext`
-   Decrypt credentials outside outbound execution

Transport is pure I/O.

------------------------------------------------------------------------

# 3. Coordination Layer (`orchestrator/`)

## Responsibilities

-   Enforce idempotency (Phase C)
-   Resolve routing
-   Resolve contact identity
-   Resolve or create conversation
-   Build `AgentContext`
-   Call `AgentService`
-   Return reply + encrypted channel metadata

Orchestrator owns inbound event lifecycle.

## Orchestrator MUST NOT

-   Send outbound HTTP requests
-   Decrypt credentials
-   Directly persist messages
-   Access transport APIs

------------------------------------------------------------------------

# 4. LLM Execution Layer (`agent/`)

## Responsibilities

-   Execute LLM calls
-   Persist messages via `MessagePersistenceService`
-   Trigger summary compression (Phase D)
-   Apply metadata exposure filtering
-   Maintain bounded conversation memory

Agent owns AI execution and AI-related runtime concerns.

## Agent MUST NOT

-   Access transport layer
-   Send outbound platform messages
-   Perform routing
-   Resolve conversations directly

------------------------------------------------------------------------

# 5. Domain Layer (`domain/`)

## Responsibilities

-   Conversation lifecycle rules
-   Routing logic
-   Contact business invariants
-   Pure business policies

Domain defines business truth --- not execution mechanics.

## Domain MUST

-   Be framework-agnostic
-   Contain no provider-specific code
-   Contain no runtime execution logic
-   Contain no infrastructure economics

## Domain MUST NOT

-   Call LLM
-   Access transport
-   Send HTTP requests
-   Import persistence
-   Encode provider pricing
-   Encode infrastructure cost logic
-   Depend on execution-layer implementation details

------------------------------------------------------------------------

# 6. Persistence Layer (`persistence/`)

## Responsibilities

-   Database writes
-   Repository access
-   Idempotency enforcement
-   Message storage
-   Conversation storage
-   Summary storage

Persistence owns data integrity and atomic guarantees.

## Persistence MUST NOT

-   Call LLM
-   Import orchestrator
-   Import agent
-   Import transport
-   Contain business decision logic

------------------------------------------------------------------------

# 7. Idempotency (Phase C -- Active)

Idempotency is mandatory.

## Rules

-   Unique compound index: `(channel, messageId)`
-   Enforced before routing
-   Duplicate events must NOT:
    -   Call AgentService
    -   Persist messages
    -   Trigger summary
    -   Touch conversation
-   In-memory deduplication is forbidden

Exactly-once semantics per inbound message are required.

------------------------------------------------------------------------

# 8. Summary Compression (Phase D -- Active)

Conversation memory must remain bounded.

## Rules

-   Summary stored at conversation level
-   Only messages after last summary are sent to LLM
-   Summarization runs asynchronously
-   LLM responses must not block on summarization
-   Channels must not know summaries exist

This guarantees long-term memory stability.

------------------------------------------------------------------------

# 9. Cross-Cutting Concern Placement Framework

When introducing a new concept, you MUST determine its correct layer
using the following classification tests.

This framework governs architectural purity.

------------------------------------------------------------------------

## 9.1 Business Invariant Test

Does this concept define business truth, lifecycle rules, or domain
policies?

If YES → it belongs in `domain/`.

If NO → it MUST NOT live in `domain/`.

------------------------------------------------------------------------

## 9.2 Execution Concern Test

Does this concept exist because of:

-   LLM execution?
-   Provider integration?
-   Runtime AI behavior?
-   Token accounting?
-   Cost estimation?
-   Model selection?

If YES → it belongs in `agent/`.

------------------------------------------------------------------------

## 9.3 Coordination Concern Test

Does this concept coordinate:

-   Event ordering?
-   Idempotency?
-   Conversation resolution?
-   Cross-service sequencing?

If YES → it belongs in `orchestrator/`.

------------------------------------------------------------------------

## 9.4 Storage Concern Test

Is this concept purely about:

-   Data persistence?
-   Querying?
-   Index enforcement?
-   Atomicity?

If YES → it belongs in `persistence/`.

------------------------------------------------------------------------

## 9.5 Transport Concern Test

Does this concept handle:

-   Webhook parsing?
-   Signature verification?
-   HTTP request/response?
-   Platform message sending?

If YES → it belongs in `channels/`.

------------------------------------------------------------------------

## 9.6 Prohibited Ambiguity

If a concept fails the Business Invariant Test,\
it MUST NOT be placed in `domain/`.

If a concept is execution-specific,\
it MUST NOT be elevated to domain.

Cross-cutting concerns must be classified --- not improvised.

------------------------------------------------------------------------

# 10. Architectural Violations

Violations include:

-   Channel importing repository
-   Agent importing channel
-   Persistence importing agent
-   Domain importing execution-specific modules
-   Direct LLM call outside AgentService
-   Transport API call outside channels
-   Circular dependencies
-   Bypassing idempotency
-   Encoding infrastructure economics in domain

Violations must fail lint and CI.

------------------------------------------------------------------------

# 11. Change Protocol

Before implementing a change:

1.  Identify the correct layer using the Placement Framework.
2.  Confirm dependency direction is valid.
3.  Confirm path aliases are used.
4.  Confirm lint passes.
5.  Confirm architecture tests pass.
6.  Confirm idempotency and summary rules remain intact.
7.  Confirm domain purity is preserved.

------------------------------------------------------------------------

# 12. Design Philosophy

This architecture prioritizes:

-   Predictability over cleverness
-   Explicit boundaries over convenience
-   Structural integrity over speed
-   Conceptual purity over abstraction drift

When uncertain:

-   Prefer consistency with existing patterns
-   Prefer smaller diffs
-   Prefer clearer boundaries
-   Never compromise layer integrity
