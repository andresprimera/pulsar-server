# Data Modeling Rules

ARCHITECTURE_CONTRACT.md has higher priority than this file.

## Schema Shape
- Use explicit collection names.
- Use timestamps: true where lifecycle tracking is needed.
- Use Types.ObjectId + ref for aggregates.

## Status Conventions
- Status fields must use explicit enums.
- Service-layer create flows must set status explicitly.

## Indexing
- Add indexes for frequent lookup fields.
- Add compound indexes for routing filters.
- Add unique indexes for business invariants.
- Define indexes after SchemaFactory.createForClass().

## Idempotency Modeling (Phase C)

- ProcessedEvent must have unique index (channel, messageId).
- Idempotency records are immutable.
- No business logic may bypass idempotency check.
- TTL index optional (if replay window desired).

## Conversation Modeling (Phase D)

- Conversation holds summary field.
- Only messages after last summary are used in context.
- Summary updates must not block user response.

## Transactions
- Multi-document atomic writes must use MongoDB transaction.
- Duplicate key (E11000) maps to conflict semantics.

## Repository Behavior
- Repository not-found returns null.
- Service layer decides domain/API exception.
- Always execute queries with .exec().