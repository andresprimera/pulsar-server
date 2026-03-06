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
- Billing cycles are **client-scoped**, not subscription-scoped. All subscriptions (ClientAgents) use the **same billing cycle**. Billing periods are derived from `client.billingAnchor`.

## BillingRecord uniqueness

- **(clientId, periodStart, periodEnd)** is unique. Enforced by a unique compound index on the BillingRecord collection. A client may have only one billing record per billing period. Duplicate key errors (MongoDB 11000) on insert indicate concurrent generation; billing generators must treat this as a **safe no-op** (e.g. return without failing).

## Billing lifecycle

- **Catalog prices** (AgentPrice, ChannelPrice): can change; only `active` prices are used for new hires.
- **Subscription snapshot** (ClientAgent.agentPricing + channels[].amount/currency): captured at hire time; remains **immutable** after creation.
- **Billing snapshot** (BillingRecord): immutable historical invoices per billing period; only `status` may change (`generated` → `paid` | `void`). Reports and billing queries use BillingRecord data, not live ClientAgent snapshots.

Flow: Catalog price → (currency resolution + optional overrides) → Subscription snapshot (ClientAgent) → Billing snapshot (BillingRecord).

## Currency rules

- **Client.billingCurrency** determines price resolution at hire time. All pricing snapshots must match client.billingCurrency. Mixed-currency subscriptions are forbidden. No runtime FX conversion occurs; missing price for the client currency fails the operation.
- Currency format: **ISO 4217**, validated with regex `/^[A-Z]{3}$/` (e.g. USD, EUR, BRL).

## Database seeding (pricing and billing)

- Seeding order: (1) catalog prices (AgentPrice, ChannelPrice) are seeded, (2) clients are created (with `billingCurrency`, `billingAnchor`), (3) ClientAgents snapshot prices at hire time, (4) billing records may be generated for the current period (e.g. dev/demo). Catalog prices are seeded **before** users; users inherit catalog pricing through snapshotting. Billing records may be generated during seeding for demo/dev environments.
- **Client** gets `billingCurrency` and `billingAnchor` via onboarding; per-user `client.billingCurrency` in seed (optional) overrides the default.
- **ClientAgent** snapshots and additional hirings use the **client’s** `billingAnchor` and `billingCurrency` (no mixed currency; quota and billing periods are consistent per client).
- Optional seed fields (for tests or demos): top-level or per-user `billingCurrency`; `agents[].monthlyTokenQuota` and `agents[].defaultPrice`; `channels[].monthlyMessageQuota` and `channels[].amount`.
- After all users and ClientAgents are seeded, the seeder optionally calls `BillingGeneratorService.generateForClient(clientId)` for each seeded client so the current period has one billing record per client (dev/demo).