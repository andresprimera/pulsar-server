# Pulsar Architecture Contract

This document defines the mandatory architectural rules of the system.

These rules are mechanically enforced via:
- ESLint boundaries
- Path aliases
- CI lint checks
- Import restrictions

No change may violate this contract.

---

# 1. Layer Overview

The system is divided into five strict layers:

1. Transport Layer (channels/)
2. Application Layer (orchestrator/)
3. LLM Execution Layer (agent/)
4. Domain Layer (domain/)
5. Persistence Layer (persistence/)

Dependency flow is strictly downward:

channels → orchestrator → agent → domain → persistence

Upward imports are forbidden.

---

# 2. Transport Layer (channels/)

Responsibilities:
- Webhook validation
- Signature verification
- Payload parsing
- Construct IncomingChannelEvent
- Call IncomingMessageOrchestrator
- Decrypt credentials
- Send outbound transport messages

Transport layer MUST NOT:
- Import repositories
- Import persistence layer
- Import AgentService
- Resolve routing
- Resolve conversation
- Persist messages
- Build AgentContext

Transport is I/O only.

---

# 3. Application Layer (orchestrator/)

Responsibilities:
- Resolve routing
- Resolve contact identity
- Resolve or create conversation
- Build AgentContext
- Call AgentService
- Return reply + encrypted channel metadata

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
- Trigger summarization
- Apply metadata exposure filtering

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
- Contact business rules
- Pure business invariants

Domain MUST NOT:
- Call LLM
- Access transport
- Send HTTP requests
- Directly write to database

Domain is business logic only.

---

# 6. Persistence Layer (persistence/)

Responsibilities:
- Database writes
- Repository access
- Idempotency enforcement (Phase C)
- Token counting
- Summary storage

Persistence MUST NOT:
- Call LLM
- Access transport layer
- Import orchestrator
- Import agent layer

Persistence owns data integrity.

---

# 7. Summary Compression Rules (Phase D)

- Summary stored as type="summary"
- Only messages AFTER last summary are used for context
- Summarization must be asynchronous
- No channel awareness of summaries
- No blocking LLM response on summarization

---

# 8. Idempotency Rules (Phase C – Future)

- Enforced at persistence layer
- Unique constraint: (channelId + messageId)
- Duplicate insert prevents LLM execution
- Channels remain stateless

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

The following are considered violations:

- Channel importing repository
- Agent importing channel
- Persistence importing agent
- Direct LLM call outside AgentService
- Transport API call outside channels
- Circular dependency between layers

Violations must fail lint and CI.

---

# 11. Change Protocol

Before implementing a change:

1. Identify the target layer.
2. Confirm no upward dependencies are introduced.
3. Confirm imports use aliases.
4. Confirm ESLint passes.
5. Confirm no boundary rules are violated.

If multiple layers must change, justification is required.

---

This contract is mandatory.