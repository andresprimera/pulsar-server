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

## Billing and client anchor

- **Client.billingAnchor** (Date, required): Defines the billing cycle anchor for the entire client. Set once at client creation and never changed. All billing periods (invoices, quota resets) are derived from this date via the domain policy (e.g. `QuotaPolicy.computeCurrentBillingPeriod(client.billingAnchor, now)`).
- **Invariant**: billingAnchor is immutable after creation. No update path may change it. All billing cycles for the client use this single anchor so that invoices and quota are deterministic and consistent across all subscriptions (ClientAgents) owned by the client.

## BillingRecord uniqueness

- **(clientId, periodStart, periodEnd)** must be unique. Enforced by a unique compound index on the BillingRecord collection. A client may have only one billing record per billing period. Duplicate key errors (MongoDB 11000) on insert indicate another worker or request already generated the record; the service should treat this as a safe no-op and return.