# Pulsar Coding Rules & Guardrails

This document defines implementation discipline.

ARCHITECTURE_CONTRACT.md is the source of truth for structural rules.
If any conflict exists, ARCHITECTURE_CONTRACT.md wins.

Do not redefine architecture here.

---

# 1. Architectural Authority

All structural rules are defined in:

- ARCHITECTURE_CONTRACT.md
- architectural-layers.md

You must:

- Respect layer boundaries
- Use path aliases
- Preserve idempotency rules
- Preserve conversation lifecycle rules
- Preserve summary compression rules

If unsure, read ARCHITECTURE_CONTRACT.md before implementing.

---

# 2. Controllers

Controllers are HTTP transport only.

They:
- Validate input via DTO
- Delegate to services
- Do not contain business logic

Do not:
- Access repositories
- Call Mongoose models
- Perform lifecycle validation
- Perform routing logic

---

# 3. Services

Services:
- Contain business logic
- Enforce lifecycle invariants
- Use repositories only for data access
- Never access models directly

Service create() must explicitly set `status: 'active'`.

Lifecycle rules are enforced in services, not controllers.

---

# 4. Repositories

Repositories:
- Are the only layer allowed to access Mongoose models
- Contain pure data access logic
- Return `null` for not-found
- Never throw HTTP exceptions

Services decide whether to throw.

---

# 5. Database & Lifecycle Rules

- No hard deletes.
- Use `status: active | inactive | archived`.
- Archived entities:
  - Cannot be modified
  - Cannot change status
  - Must remain readable

Multi-document writes must use transactions.

---

# 6. DTO & Validation

- All input must use DTOs with `class-validator`.
- DTOs must be colocated with feature module.
- Use NestJS ValidationPipe with default configuration.
- Do not manually validate in controllers.
- Do not trust raw input.

---

# 7. Logging

- Use NestJS Logger.
- Never use console.log.
- Logging must be structured and consistent.

---

# 8. Error Handling

Use NestJS exceptions:
- NotFoundException
- BadRequestException
- ConflictException
- ForbiddenException

Do not:
- Return null/false for errors
- Swallow exceptions silently

---

# 9. Credential Security

- Encrypt all credentials before storage.
- Credential schema fields must use `select: false`.
- Use `.select('+field')` when explicitly needed.
- Decrypt only at execution boundary (channels or LLM boundary).

Routing identifiers (phoneNumberId, instagramAccountId, etc.) remain plaintext for indexing.

See:
docs/rules/credential-encryption.md

---

# 10. Channel Integration (Current Pattern)

Channels are pure transport.

They must:
- Validate webhook
- Parse payload
- Construct IncomingChannelEvent
- Call IncomingMessageOrchestrator
- Send outbound message using returned metadata

Channels must NOT:
- Perform routing
- Resolve conversation
- Persist messages
- Call AgentService directly
- Access repositories

All inbound message lifecycle must pass through orchestrator.

---

# 11. Idempotency (Phase C – Active)

Inbound messages must be idempotent.

Rules:
- Unique constraint on (channel, messageId)
- Duplicate events must not:
  - Call LLM
  - Persist messages
  - Trigger summary
  - Touch conversation

Never bypass idempotency guard.

---

# 12. Conversation & Summary (Phase D – Active)

Conversation memory must remain bounded.

Rules:
- Conversation stores summary.
- Only messages after last summary are sent to LLM.
- Summarization must not block user response.
- Channels must not know summary exists.

---

# 13. Data Modeling

- Use explicit collection names.
- Add indexes for queried fields.
- Add compound indexes for routing.
- Add unique indexes for invariants.
- Use `_id: false` for embedded schemas.

See:
docs/rules/data-modeling.md

---

# 14. Scope Discipline

- Implement only what is requested.
- Do not refactor unrelated code.
- Do not rename fields without explicit instruction.
- Preserve backward compatibility.

Success = minimal diff + zero regressions + full alignment.

---

# 15. When Uncertain

1. Mirror existing patterns.
2. Check ARCHITECTURE_CONTRACT.md.
3. Prefer consistency over creativity.
4. If conflict appears, request clarification.
