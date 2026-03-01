# Pulsar Architecture Contract

This document defines the mandatory architectural rules of the system.

These rules are mechanically enforced via:
- ESLint boundaries
- Path aliases
- CI lint checks
- Import restrictions
- Architecture tests

No change may violate this contract.

---

# 1. Layer Overview

The system is divided into five strict layers:

1. Transport Layer (`channels/`)
2. Coordination Layer (`orchestrator/`)
3. LLM Execution Layer (`agent/`)
4. Domain Layer (`domain/`)
5. Persistence Layer (`persistence/`)

## Allowed Dependency Flow

channels → orchestrator

orchestrator → domain  
orchestrator → agent  
orchestrator → persistence (idempotency only)

agent → domain  
agent → persistence  

Domain → (no outward dependencies)  
Persistence → (no outward dependencies)

Upward or sideways imports are forbidden.

---

# 2. Transport Layer (channels/)

Responsibilities:
- Webhook validation
- Signature verification
- Payload parsing
- Construct IncomingChannelEvent
- Call IncomingMessageOrchestrator
- Send outbound platform messages

Transport MUST NOT:
- Import repositories
- Import persistence layer
- Import AgentService
- Resolve routing
- Resolve conversation
- Persist messages
- Build AgentContext

Transport is pure I/O.

---

# 3. Coordination Layer (orchestrator/)

Responsibilities:
- Enforce event idempotency (Phase C)
- Resolve routing
- Resolve contact identity
- Resolve or create conversation
- Build AgentContext
- Call AgentService
- Return reply + encrypted channel metadata

Orchestrator owns event lifecycle.

Orchestrator MUST NOT:
- Send outbound HTTP requests
- Decrypt credentials
- Directly persist messages
- Access transport APIs

---

# 4. LLM Execution Layer (agent/)

Responsibilities:
- Execute LLM calls
- Persist messages via MessagePersistenceService
- Trigger conversation summarization
- Apply metadata exposure filtering
- Maintain bounded conversation memory

Agent MUST NOT:
- Access transport layer
- Send outbound platform messages
- Perform routing
- Directly resolve conversations

---

# 5. Domain Layer (domain/)

Responsibilities:
- Conversation lifecycle logic
- Routing logic
- Contact business invariants
- Pure business rules

Domain MUST NOT:
- Call LLM
- Access transport
- Send HTTP requests
- Directly write to database

Domain is framework-agnostic logic.

---

# 6. Persistence Layer (persistence/)

Responsibilities:
- Database writes
- Repository access
- Idempotency enforcement (Phase C)
- Message storage
- Conversation storage
- Summary storage

Persistence MUST NOT:
- Call LLM
- Access transport
- Import orchestrator
- Import agent

Persistence owns data integrity and atomic guarantees.

---

# 7. Idempotency (Phase C – Active)

Idempotency is mandatory.

Rules:
- Unique compound index: (channel, messageId)
- Enforced before routing
- Duplicate events must NOT:
  - Call AgentService
  - Persist messages
  - Trigger summary
  - Touch conversation
- In-memory deduplication is forbidden

Exactly-once semantics per inbound message are required.

---

# 8. Summary Compression (Phase D – Active)

Conversation memory must remain bounded.

Rules:
- Summary stored at conversation level
- Only messages after last summary are sent to LLM
- Summarization must run asynchronously
- LLM responses must not block on summarization
- Channels must not know summaries exist

This guarantees long-term memory stability.

---

# 9. Alias Usage Rule

All cross-folder imports MUST use path aliases:

@channels/*
@orchestrator/*
@agent/*
@domain/*
@persistence/*
@shared/*

Relative parent imports across layers are forbidden.

---

# 10. Architectural Violations

Violations include:

- Channel importing repository
- Agent importing channel
- Persistence importing agent
- Direct LLM call outside AgentService
- Transport API call outside channels
- Circular dependency between layers
- Bypassing idempotency

Violations must fail lint and CI.

---

# 11. Change Protocol

Before implementing a change:

1. Identify target layer.
2. Confirm dependency direction is valid.
3. Confirm aliases are used.
4. Confirm lint passes.
5. Confirm architecture tests pass.
6. Confirm idempotency and summary rules remain intact.

This contract is mandatory.