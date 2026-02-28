# Project Coding Rules & Architecture Guardrails

NestJS + MongoDB (Mongoose) backend. Follow established patterns. Do not break existing behavior.

## 1. Layered Architecture (DO NOT VIOLATE)

**Controller** → HTTP only, no logic, delegates to services
**Service** → Business logic, lifecycle enforcement, uses repositories only
**Repository** → ONLY layer that accesses Mongoose models, pure data access

❌ Do NOT skip layers ❌ Do NOT access models outside repositories ❌ Do NOT add logic to controllers

## 2. Database & Lifecycle

- Schemas: `src/database/schemas` | Repositories: `src/database/repositories`
- `DatabaseModule` is `@Global()` — registers all repos, no need to import in feature modules
- **No hard deletes** — use `status: active | inactive | archived`
- Archived entities: cannot be modified, cannot change status, must remain readable
- Lifecycle rules enforced in **services**, not controllers
- Service `create()` MUST explicitly set `status: 'active'`

## 3. Validation & DTOs

- All input via DTOs with `class-validator` decorators, co-located with feature module
- `@Transform` MUST appear before `@IsEnum` (normalize provider strings to lowercase)
- Use NestJS `ValidationPipe()` with default options — do NOT change config

❌ Do NOT validate manually in controllers ❌ Do NOT trust raw input

## 4. Modules & Registration

- Each feature has its own module (controller + service)
- Repositories registered ONLY in `DatabaseModule`
- Use NestJS `Logger` class (not `console.log`): `private readonly logger = new Logger(ClassName.name)`

❌ Do NOT register repositories in feature modules ❌ Do NOT create circular dependencies

## 5. API Design

- RESTful conventions, thin controllers
- `PATCH /:id` → update fields | `PATCH /:id/status` → lifecycle only

## 6. Error Handling

- Use NestJS exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`)
- Repositories return `null` for not-found — services decide whether to throw

❌ Do NOT return null/false for errors ❌ Do NOT swallow exceptions

## 7. Credential Security

- Encrypt all API keys/credentials before storage: `encrypt()` / `encryptRecord()` from `src/database/utils/crypto.util.ts`
- Schema credential fields MUST use `select: false` — queries `.select('+field')` when needed
- Routing keys (`phoneNumberId`, `tiktokUserId`, `instagramAccountId`) stored **unencrypted** for indexed lookups

→ Details: `docs/rules/credential-encryption.md`

## 8. Channel Integration

- Follow `src/channels/whatsapp/` pattern: `config.ts` + `service.ts` + `controller.ts` + `module.ts`
- MUST use `AgentRoutingService.resolveRoute()` — handle `resolved`, `ambiguous`, `unroutable`
- MUST call `AgentContextService.enrichContext()` before `AgentService.run()` — enriches system prompt with client/agent identity
- Do NOT persist messages manually — `AgentService.run()` handles it via `MessagePersistenceService`
- LLM calls via Vercel AI SDK (`generateText`) through `createLLMModel()` — never import provider SDKs directly

→ Details: `docs/rules/channel-integration.md` | `docs/rules/context-enrichment.md`

## 9. Data Modeling

- Embedded subdocuments: `@Schema({ _id: false })` + `SchemaFactory.createForClass()`
- Indexes: `index: true` on queried fields, compound indexes for routing, unique for business constraints
- Atomic multi-document writes: use MongoDB transactions with `session` parameter

→ Details: `docs/rules/data-modeling.md`

## 10. Guardrails

- **Backward compatibility**: Do NOT break endpoints, rename fields, or change behavior unless requested
- **Scope discipline**: Implement ONLY what is requested — no "nice to have" improvements
- **Code style**: Follow existing naming, small functions, no commented-out code, no deep nesting
- **When uncertain**: Infer from existing code, mirror similar features (e.g. Agents CRUD)

## 11. Summary Rule (MOST IMPORTANT)

Do not be creative with architecture. Be boring, consistent, and predictable.

Success = minimal diff + zero regressions + full alignment with existing patterns

## Reference Docs (read when working on related features)

**Rules (how to write code):**
- `docs/rules/credential-encryption.md` — encryption patterns, routing keys, crypto utility
- `docs/rules/channel-integration.md` — new channel blueprint, routing, message flow
- `docs/rules/context-enrichment.md` — AgentContextService, system prompt enrichment, adding new context
- `docs/rules/data-modeling.md` — schemas, indexes, transactions, repository conventions
- `docs/rules/configuration.md` — ValidationPipe, Logger, DatabaseModule, LLM SDK

**System documentation (how the system works):**
- `docs/AGENT_ROUTING.md` — multi-agent routing strategies, cascade logic, architecture diagrams
- `docs/MESSAGE_PERSISTENCE.md` — message flow, conversation context, automatic summarization
