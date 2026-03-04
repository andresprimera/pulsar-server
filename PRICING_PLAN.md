Original prompt

How would you define the pricing strategy, by being very strict about our architecture purity.

- agents are going to have a monthly price. This price includes a consumtion quota.
- Channels are going to have a price. THis price also includes a quota.
- When the user hires an agent, they will pay the total monthly amount for agent + channels.
- prices can change over time, but users will keep their prices when this happens.
- I could define special prices for particular clients discretionally.



# Pricing & Quota Enforcement Plan

## Context

Agents and channels need monthly pricing with consumption quotas. Agents include a token quota; channels include a message quota (varying by channel — some like Telegram are free). When a client hires an agent, prices are **snapshotted** so future catalog changes don't affect existing clients. Admins can set special pricing per client. When quotas are exceeded, message processing is **blocked**.

Prices support **multiple currencies** via separate price tables (`AgentPrice`, `ChannelPrice`). Agents and channels remain single global entities — no duplication per currency. Each client has a `billingCurrency`, and price lookup uses that currency at hire time. No runtime FX conversion occurs; if a price doesn't exist for the requested currency, the operation fails.

**Currency consistency invariant:** all pricing snapshots within a ClientAgent must match `Client.billingCurrency`. Mixed-currency subscriptions are forbidden. Overrides can change amounts but never the currency.

**Immutable billing records:** each billing cycle produces a `BillingRecord` snapshot. Past invoices are never recomputed. Reports and billing queries use BillingRecord data.

**Price lifecycle:** catalog prices (`AgentPrice`, `ChannelPrice`) carry a `status` field (`active` | `deprecated`). Only `active` prices can be used when hiring. Deprecated prices remain for historical reference.

---

## Concern Classification

| Concept | Layer | Justification |
|---|---|---|
| Catalog prices (`AgentPrice`, `ChannelPrice`) | **Persistence** | Separate schemas per currency, UNIQUE(entityId, currency) |
| Price lifecycle (`status: active/deprecated`) | **Persistence** | Data field on price schemas |
| Client billing currency | **Persistence** | Data field on Client schema |
| Snapshotted prices (on ClientAgent) | **Persistence** | Immutable data captured at hire time |
| Billing records (`BillingRecord`) | **Persistence** | Immutable invoice snapshots per billing cycle |
| Quota exhaustion rule (`isExceeded`) | **Domain** | Pure business invariant, no dependencies |
| Billing period computation | **Domain** | Pure date logic, no dependencies |
| Currency consistency invariant | **Domain** | Pure assertion: all snapshot currencies must match client currency |
| Currency format validation (`/^[A-Z]{3}$/`) | **Domain** | Pure validation rule, no dependencies |
| Quota enforcement gate | **Orchestrator** | Coordination concern (same pattern as idempotency) |
| Token usage aggregation query | **Persistence** | Database aggregation |
| Message counting query | **Persistence** | Database query |
| Special pricing overrides (amount only) | **Features** | Admin DTO overrides at hire time, currency locked to client |

---

## Implementation Steps

### Step 1 — Add quota fields to Agent and Channel schemas (no prices)

**File:** [agent.schema.ts](src/core/persistence/schemas/agent.schema.ts) — add only the quota:
```ts
@Prop({ type: Number, default: null })
monthlyTokenQuota: number | null;  // null = unlimited
```

**File:** [channel.schema.ts](src/core/persistence/schemas/channel.schema.ts) — add only the quota:
```ts
@Prop({ type: Number, default: null })
monthlyMessageQuota: number | null;  // null = unlimited (e.g., Telegram)
```

Prices do **not** live on Agent or Channel. They live in separate price tables (Step 1b).

Update [create-agent.dto.ts](src/features/agents/dto/create-agent.dto.ts), [update-agent.dto.ts](src/features/agents/dto/update-agent.dto.ts), and [seeder.service.ts](src/core/persistence/seeder.service.ts) for the quota fields.

---

### Step 1b — Create multi-currency price tables

**New file:** `src/core/persistence/schemas/agent-price.schema.ts`

```ts
@Schema({ collection: 'agent_prices', timestamps: true })
export class AgentPrice extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Agent', required: true })
  agentId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;  // ISO 4217: USD, EUR, BRL, etc.

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: ['active', 'deprecated'], default: 'active' })
  status: 'active' | 'deprecated';
}

AgentPriceSchema.index({ agentId: 1, currency: 1 }, { unique: true });
```

**New file:** `src/core/persistence/schemas/channel-price.schema.ts`

```ts
@Schema({ collection: 'channel_prices', timestamps: true })
export class ChannelPrice extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: ['active', 'deprecated'], default: 'active' })
  status: 'active' | 'deprecated';
}

ChannelPriceSchema.index({ channelId: 1, currency: 1 }, { unique: true });
```

**New file:** `src/core/persistence/repositories/agent-price.repository.ts`

```ts
async findActiveByAgentAndCurrency(agentId: Types.ObjectId, currency: string): Promise<AgentPrice | null>
// Filters: status = 'active'
async upsert(agentId: Types.ObjectId, currency: string, amount: number): Promise<AgentPrice>
async deprecate(agentId: Types.ObjectId, currency: string): Promise<AgentPrice | null>
async findByAgent(agentId: Types.ObjectId): Promise<AgentPrice[]>
// Returns all prices (active + deprecated) for admin listing
```

**New file:** `src/core/persistence/repositories/channel-price.repository.ts`

```ts
async findActiveByChannelAndCurrency(channelId: Types.ObjectId, currency: string): Promise<ChannelPrice | null>
// Filters: status = 'active'
async upsert(channelId: Types.ObjectId, currency: string, amount: number): Promise<ChannelPrice>
async deprecate(channelId: Types.ObjectId, currency: string): Promise<ChannelPrice | null>
async findByChannel(channelId: Types.ObjectId): Promise<ChannelPrice[]>
// Returns all prices (active + deprecated) for admin listing
```

Register both schemas and repositories in [database.module.ts](src/core/persistence/database.module.ts).

---

### Step 1c — Add `billingCurrency` to Client schema

**File:** [client.schema.ts](src/core/persistence/schemas/client.schema.ts)

```ts
@Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/, default: 'USD' })
billingCurrency: string;  // ISO 4217 — validated with regex, uppercase enforced
```

Update [register-and-hire.dto.ts](src/features/onboarding/dto/register-and-hire.dto.ts) `ClientDto` to accept `billingCurrency`. Add DTO validation:
```ts
@IsOptional()
@IsString()
@Matches(/^[A-Z]{3}$/, { message: 'billingCurrency must be a valid ISO 4217 code (e.g., USD, EUR, BRL)' })
billingCurrency?: string;
```

---

### Step 2 — Create admin endpoints for managing prices

**New file:** `src/features/agent-prices/agent-prices.module.ts` (+ controller, service, DTOs)

Endpoints:
- `PUT /agents/:agentId/prices/:currency` — upsert an agent price for a currency (creates as `active`)
- `GET /agents/:agentId/prices` — list all prices for an agent (includes `deprecated` for admin visibility)
- `PATCH /agents/:agentId/prices/:currency/deprecate` — set status to `deprecated` (price remains for history, cannot be used for new hires)

**New file:** `src/features/channel-prices/channel-prices.module.ts` (+ controller, service, DTOs)

Same pattern for channel prices. Currency must match `/^[A-Z]{3}$/` in all DTOs.

---

### Step 3 — Restructure ClientAgent schema for price snapshots

**File:** [client-agent.schema.ts](src/core/persistence/schemas/client-agent.schema.ts)

**Replace** the flat `price: number` field with structured pricing that includes currency:

```ts
@Schema({ _id: false })
export class AgentPricingSnapshot {
  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, maxlength: 3 })
  currency: string;

  @Prop({ type: Number, default: null })
  monthlyTokenQuota: number | null;
}
```

Add to `ClientAgent`:
```ts
@Prop({ type: AgentPricingSnapshotSchema, required: true })
agentPricing: AgentPricingSnapshot;

@Prop({ required: true })
billingAnchor: Date;  // Set once at hire time, billing cycles from this date
```

Add to `HireChannelConfig`:
```ts
@Prop({ required: true, min: 0, default: 0 })
amount: number;

@Prop({ required: true, uppercase: true, maxlength: 3 })
currency: string;

@Prop({ type: Number, default: null })
monthlyMessageQuota: number | null;
```

Update [client-agent.entity.ts](src/core/persistence/entities/client-agent.entity.ts) to match.

---

### Step 4 — Snapshot pricing at hire time (currency-aware)

**Files:**
- [client-agents.service.ts](src/features/client-agents/client-agents.service.ts)
- [create-client-agent.dto.ts](src/features/client-agents/dto/create-client-agent.dto.ts)
- [register-and-hire.dto.ts](src/features/onboarding/dto/register-and-hire.dto.ts)
- [onboarding.service.ts](src/features/onboarding/onboarding.service.ts)

**DTO changes:**
- Remove the required `price` field from both DTOs
- Add optional `pricingOverride` for special pricing (**amount only, currency is always `client.billingCurrency`**):
  ```ts
  @IsOptional()
  pricingOverride?: {
    agentAmount?: number;
    agentMonthlyTokenQuota?: number | null;
  }
  ```
- Add optional per-channel overrides in `HireChannelConfigDto` (**no currency override**):
  ```ts
  @IsOptional()
  amountOverride?: number;
  @IsOptional()
  monthlyMessageQuotaOverride?: number | null;
  ```

Overrides can change amounts but **never the currency**. Currency is always locked to `client.billingCurrency`. This prevents mixed-currency subscriptions.

**Service changes** (in `create()`):

Price resolution flow:
1. Fetch client → read `client.billingCurrency`
2. Fetch **active** `AgentPrice` for `(agentId, billingCurrency)` — fail with `BadRequestException` if not found
3. For each channel, fetch **active** `ChannelPrice` for `(channelId, billingCurrency)` — fail if not found
4. Apply amount overrides if provided (special pricing)
5. Assert currency consistency invariant
6. Snapshot into ClientAgent with currency

```ts
const currency = client.billingCurrency;

// Agent pricing snapshot
const agentPrice = await this.agentPriceRepository.findActiveByAgentAndCurrency(agentId, currency);
if (!agentPrice && !data.pricingOverride?.agentAmount) {
  throw new BadRequestException(`No active price found for agent in currency ${currency}`);
}
const agentPricing = {
  amount: data.pricingOverride?.agentAmount ?? agentPrice.amount,
  currency,
  monthlyTokenQuota: data.pricingOverride?.agentMonthlyTokenQuota ?? agent.monthlyTokenQuota,
};

// Per-channel pricing snapshot (inside channel loop)
const channelPrice = await this.channelPriceRepository.findActiveByChannelAndCurrency(channelId, currency);
if (!channelPrice && !channelConfig.amountOverride) {
  throw new BadRequestException(`No active price found for channel in currency ${currency}`);
}
// Add to channel config:
//   amount: channelConfig.amountOverride ?? channelPrice.amount,
//   currency,  // always client.billingCurrency
//   monthlyMessageQuota: channelConfig.monthlyMessageQuotaOverride ?? channel.monthlyMessageQuota,
```

Set `billingAnchor: new Date()`

**Update `calculateClientTotal()`:**
```ts
async calculateClientTotal(clientId: string): Promise<{ total: number; currency: string }> {
  const client = await this.clientsService.findById(clientId);
  if (!client) throw new NotFoundException('Client not found');

  const activeClientAgents =
    await this.clientAgentRepository.findByClientAndStatus(clientId, 'active');

  if (activeClientAgents.length === 0) return { total: 0, currency: client.billingCurrency };

  // Currency consistency assertion — detect corrupted state
  const hasMismatch = activeClientAgents.some(
    ca => ca.agentPricing.currency !== client.billingCurrency,
  );
  if (hasMismatch) {
    throw new InternalServerErrorException(
      'Mixed currency subscriptions detected — data integrity violation',
    );
  }

  const total = activeClientAgents.reduce((sum, ca) => {
    const agentAmount = ca.agentPricing.amount;
    const channelsAmount = ca.channels
      .filter(ch => ch.status === 'active')
      .reduce((chSum, ch) => chSum + ch.amount, 0);
    return sum + agentAmount + channelsAmount;
  }, 0);

  return { total, currency: client.billingCurrency };
}
```

---

### Step 5 — Add usage aggregation queries to repositories

**File:** [llm-usage-log.repository.ts](src/core/persistence/repositories/llm-usage-log.repository.ts)

```ts
async sumTokensForClientAgent(
  clientId: Types.ObjectId, agentId: Types.ObjectId,
  periodStart: Date, periodEnd: Date,
): Promise<number>
```
Uses MongoDB `$aggregate` to sum `totalTokens` within the billing period.

**File:** [message.repository.ts](src/core/persistence/repositories/message.repository.ts)

```ts
async countMessagesForClientChannel(
  clientId: Types.ObjectId, channelId: Types.ObjectId,
  periodStart: Date, periodEnd: Date,
): Promise<number>
```
Uses `countDocuments` to count messages (type `user`) within the billing period.

**Add indexes** for efficient queries:
- `llm-usage-log.schema.ts`: `{ clientId: 1, agentId: 1, createdAt: 1 }`
- `message.schema.ts`: `{ clientId: 1, channelId: 1, type: 1, status: 1, createdAt: 1 }`

---

### Step 6 — Create domain billing policy

**New file:** `src/core/domain/quota/quota-policy.ts`

Pure functions with zero dependencies:
```ts
QuotaPolicy.isExceeded(quota: number | null, currentUsage: number): boolean
// null quota = unlimited = never exceeded

computeCurrentBillingPeriod(billingAnchor: Date, now?: Date): { start: Date, end: Date }
// Monthly period anchored to the hire date's day-of-month
```

**New file:** `src/core/domain/billing/currency.validator.ts`

Pure validation with zero dependencies:
```ts
const ISO_4217_PATTERN = /^[A-Z]{3}$/;

export function isValidCurrencyCode(code: string): boolean {
  return ISO_4217_PATTERN.test(code);
}

export function assertCurrencyMatch(snapshotCurrency: string, clientCurrency: string): void {
  if (snapshotCurrency !== clientCurrency) {
    throw new Error(`Currency mismatch: snapshot=${snapshotCurrency}, client=${clientCurrency}`);
  }
}
```

These are pure business invariants — no persistence, no execution logic, no infrastructure economics.

---

### Step 6b — Create BillingRecord schema

**New file:** `src/core/persistence/schemas/billing-record.schema.ts`

```ts
@Schema({ _id: false })
export class BillingLineItem {
  @Prop({ required: true, enum: ['agent', 'channel'] })
  type: 'agent' | 'channel';

  @Prop({ type: Types.ObjectId, required: true })
  referenceId: Types.ObjectId;  // agentId or channelId

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  amount: number;
}

@Schema({ collection: 'billing_records', timestamps: true })
export class BillingRecord extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({ required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;

  @Prop({ type: [BillingLineItemSchema], required: true })
  items: BillingLineItem[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, enum: ['generated', 'paid', 'void'], default: 'generated' })
  status: 'generated' | 'paid' | 'void';
}

BillingRecordSchema.index({ clientId: 1, periodStart: 1, periodEnd: 1 });
```

**Rules:**
- Billing records are **immutable** — no updates except `status` transitions (`generated` → `paid`, `generated` → `void`)
- Past invoices must never be recomputed
- Reports and billing queries must use BillingRecord data, not live ClientAgent snapshots

**New file:** `src/core/persistence/repositories/billing-record.repository.ts`

```ts
async create(data: Partial<BillingRecord>): Promise<BillingRecord>
async findByClient(clientId: Types.ObjectId): Promise<BillingRecord[]>
async findByClientAndPeriod(clientId: Types.ObjectId, periodStart: Date, periodEnd: Date): Promise<BillingRecord | null>
async updateStatus(id: Types.ObjectId, status: 'paid' | 'void'): Promise<BillingRecord | null>
// No general update method — records are immutable except for status
```

Register schema and repository in [database.module.ts](src/core/persistence/database.module.ts).

---

### Step 7 — Create orchestrator quota enforcement service

**New file:** `src/core/orchestrator/quota-enforcement.service.ts`

```ts
@Injectable()
export class QuotaEnforcementService {
  constructor(
    private readonly llmUsageLogRepository: LlmUsageLogRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async check(input: QuotaCheckInput): Promise<QuotaCheckResult>
}
```

Checks agent token quota + channel message quota. Returns `{ allowed: true }` or `{ allowed: false, reason }`.

**Modify:** [orchestrator.module.ts](src/core/orchestrator/orchestrator.module.ts) — register `QuotaEnforcementService`.

---

### Step 8 — Insert quota gate in orchestrator flow

**File:** [incoming-message.orchestrator.ts](src/core/orchestrator/incoming-message.orchestrator.ts)

Insert **after** the agent-active check (line 105) and **before** building the AgentContext (line 107):

```
1. Idempotency check (existing, line 40-50)
2. Route resolution (existing, line 52-87)
3. Credentials guard (existing, line 90-95)
4. Agent active check (existing, line 97-105)
5. >>> QUOTA ENFORCEMENT GATE (NEW) <<<
6. Build AgentContext (existing, line 107+)
7. ... rest of flow unchanged
```

If quota is exceeded, log a warning and return `undefined` (message is dropped).

---

### Step 9 — Architecture steward review loop

After all implementation steps are complete, run the `architecture-steward` agent to validate that the entire changeset complies with the Pulsar Architecture Contract.

**Process:**

1. Run `/review-architecture` (the `architecture-steward` agent) against all changes on the current branch
2. The agent reviews every modified and created file against the rules in `ARCHITECTURE_CONTRACT.md` and `CLAUDE.md`
3. If the agent reports **violations**, fix them immediately
4. Re-run the agent after each fix
5. **Repeat until the agent returns a clean approval with zero violations**

**What the agent checks:**
- Layer dependency directions (no upward or sideways imports)
- Path alias usage (no relative parent imports across layers)
- Domain purity (no persistence imports, no execution logic, no infrastructure economics)
- Persistence boundaries (no business decision logic in schemas/repositories)
- Orchestrator boundaries (no outbound HTTP, no credential decryption, no direct message persistence)
- Idempotency and summary compression rules remain intact
- No transport logic leakage into inner layers
- Import restrictions enforced via `@channels/*`, `@orchestrator/*`, `@agent/*`, `@domain/*`, `@persistence/*`, `@shared/*`

**Exit criteria:** The architecture-steward agent must return **approved** with no violations before proceeding to verification tests.

---

## Files Summary

| Action | File |
|---|---|
| MODIFY | `src/core/persistence/schemas/agent.schema.ts` (add `monthlyTokenQuota` only) |
| MODIFY | `src/core/persistence/schemas/channel.schema.ts` (add `monthlyMessageQuota` only) |
| MODIFY | `src/core/persistence/schemas/client.schema.ts` (add `billingCurrency`) |
| MODIFY | `src/core/persistence/schemas/client-agent.schema.ts` |
| MODIFY | `src/core/persistence/entities/client-agent.entity.ts` |
| CREATE | `src/core/persistence/schemas/agent-price.schema.ts` |
| CREATE | `src/core/persistence/schemas/channel-price.schema.ts` |
| CREATE | `src/core/persistence/schemas/billing-record.schema.ts` |
| CREATE | `src/core/persistence/repositories/agent-price.repository.ts` |
| CREATE | `src/core/persistence/repositories/channel-price.repository.ts` |
| CREATE | `src/core/persistence/repositories/billing-record.repository.ts` |
| MODIFY | `src/core/persistence/repositories/llm-usage-log.repository.ts` |
| MODIFY | `src/core/persistence/repositories/message.repository.ts` |
| MODIFY | `src/core/persistence/schemas/llm-usage-log.schema.ts` (index) |
| MODIFY | `src/core/persistence/schemas/message.schema.ts` (index) |
| MODIFY | `src/core/persistence/database.module.ts` |
| MODIFY | `src/core/persistence/seeder.service.ts` |
| CREATE | `src/core/domain/quota/quota-policy.ts` |
| CREATE | `src/core/domain/billing/currency.validator.ts` |
| CREATE | `src/core/orchestrator/quota-enforcement.service.ts` |
| MODIFY | `src/core/orchestrator/orchestrator.module.ts` |
| MODIFY | `src/core/orchestrator/incoming-message.orchestrator.ts` |
| MODIFY | `src/features/client-agents/dto/create-client-agent.dto.ts` |
| MODIFY | `src/features/client-agents/client-agents.service.ts` |
| MODIFY | `src/features/onboarding/dto/register-and-hire.dto.ts` |
| MODIFY | `src/features/onboarding/onboarding.service.ts` |
| MODIFY | `src/features/agents/dto/create-agent.dto.ts` |
| MODIFY | `src/features/agents/dto/update-agent.dto.ts` |
| CREATE | `src/features/agent-prices/` (module, controller, service, DTOs) |
| CREATE | `src/features/channel-prices/` (module, controller, service, DTOs) |
| UPDATE | `docs/rules/ARCHITECTURE_CONTRACT.md` |
| UPDATE | `docs/rules/architectural-layers.md` |
| UPDATE | `docs/rules/data-modeling.md` |
| UPDATE | `docs/rules/configuration.md` |
| UPDATE | `.claude/CLAUDE.md` |

---

## Verification

### Architecture checks

1. **ESLint architecture boundaries**: `npm run lint` — confirm no layer boundary violations (ESLint `@boundaries/element-types` and `@boundaries/entry-point` rules pass)
2. **Path alias enforcement**: Verify all cross-layer imports use `@channels/*`, `@orchestrator/*`, `@agent/*`, `@domain/*`, `@persistence/*`, `@shared/*` — no relative parent imports across layers
3. **Domain purity check**: Verify `src/core/domain/` has zero imports from persistence, agent, orchestrator, or channels layers
4. **Dependency direction audit**: Verify no upward or sideways imports exist (channels → orchestrator only, orchestrator → domain/agent/persistence only, etc.)
5. **Architecture steward approval**: The `/review-architecture` agent must have returned clean approval in Step 9

### Build & type checks

6. **Build**: `npm run build` — confirm no TypeScript errors

### Functional tests

7. **Multi-currency catalog test**: Create `AgentPrice(agent, USD, 49)` and `AgentPrice(agent, BRL, 199)`. Verify both exist and the unique constraint prevents duplicates.
8. **Currency resolution test**: Create a client with `billingCurrency: BRL`. Hire an agent. Verify the snapshot has `amount: 199, currency: BRL`.
9. **Missing currency test**: Create a client with `billingCurrency: JPY`. Attempt to hire — verify `BadRequestException` because no JPY price exists.
10. **Currency format validation test**: Attempt to create a price with currency `usd`, `Dollar`, `EURO`, or `US$`. Verify all are rejected.
11. **Price lifecycle test**: Deprecate an `AgentPrice`. Attempt to hire using the deprecated price — verify `BadRequestException`. Verify deprecated price still appears in admin listing.
12. **Currency consistency test**: Verify `calculateClientTotal()` throws `InternalServerErrorException` if a ClientAgent snapshot currency doesn't match `client.billingCurrency` (simulated data corruption).
13. **Override constraints test**: Verify that overrides can change `amount` but currency is always locked to `client.billingCurrency`. No `currencyOverride` field accepted.
14. **Quota test**: Set `monthlyTokenQuota: 100` on the agent. Hire it. Send messages until tokens are exceeded. Verify the next message is blocked.
15. **Billing total test**: Call `GET /billing/client/:clientId` — verify it returns `{ total, currency }` with correct amounts.
16. **Billing record test**: Generate a `BillingRecord` for a billing cycle. Verify it is immutable (no amount changes). Verify `status` can transition `generated` → `paid`.
17. **Grandfathering test**: Update `AgentPrice(agent, BRL)` from 199 to 249. Verify the existing ClientAgent snapshot still shows `amount: 199`.
18. **Special pricing test**: Hire with `pricingOverride.agentAmount: 99`. Verify the snapshot uses 99 instead of the catalog price.

---

## Step 10 — Synchronize documentation with the updated architecture

**This step runs last** — after all implementation, architecture review, and verification tests are complete. Any corrections made during testing are reflected in the documentation.

Review and update all repository documentation to reflect the new pricing architecture. Documentation must match the actual system implementation.

**Files to review and update:**

| File | What to update |
|---|---|
| [ARCHITECTURE_CONTRACT.md](docs/rules/ARCHITECTURE_CONTRACT.md) | Add pricing-related persistence responsibilities (`AgentPrice`, `ChannelPrice`, `BillingRecord`). Update domain responsibilities to include quota policy and currency invariants. Update orchestrator responsibilities to include quota enforcement gate. |
| [architectural-layers.md](docs/rules/architectural-layers.md) | Update layer responsibility descriptions to reflect new services: `QuotaEnforcementService` in orchestrator, `QuotaPolicy` and `currency.validator` in domain, price repositories and billing record repository in persistence. |
| [data-modeling.md](docs/rules/data-modeling.md) | Add new entity documentation for `AgentPrice`, `ChannelPrice`, `BillingRecord`. Update `Agent` (new `monthlyTokenQuota`), `Channel` (new `monthlyMessageQuota`), `Client` (new `billingCurrency`), `ClientAgent` (replaced `price` with `agentPricing` snapshot, `billingAnchor`, per-channel `amount`/`currency`/`monthlyMessageQuota`). Document entity relationships and the snapshot lifecycle. |
| [configuration.md](docs/rules/configuration.md) | Add any new environment variables or configuration related to quota enforcement or billing. |
| [credential-encryption.md](docs/rules/credential-encryption.md) | No changes expected — pricing data is not encrypted. Verify no conflicts. |
| [CLAUDE.md](.claude/CLAUDE.md) | Update the architecture contract sections if they reference persistence responsibilities, domain purity rules, or orchestrator coordination duties to include pricing and quota concerns. |

**Data modeling documentation must include:**

Entity relationship summary:
```
Agent ──1:N──▸ AgentPrice (one per currency)
Channel ──1:N──▸ ChannelPrice (one per currency)
Client ──1:N──▸ ClientAgent
ClientAgent ──embeds──▸ AgentPricingSnapshot (amount, currency, monthlyTokenQuota)
ClientAgent ──embeds──▸ HireChannelConfig[].pricing (amount, currency, monthlyMessageQuota)
Client ──1:N──▸ BillingRecord (one per billing cycle)
```

Key invariants to document:
- `AgentPrice` and `ChannelPrice` are catalog entries, UNIQUE per `(entityId, currency)`
- Prices carry `status: 'active' | 'deprecated'` — only active prices used for new hires
- `ClientAgent` stores snapshotted prices at hire time — immutable after creation
- `Client.billingCurrency` determines which catalog price is resolved
- All snapshot currencies must match `Client.billingCurrency` (currency consistency invariant)
- Currency format: ISO 4217, validated with `/^[A-Z]{3}$/`
- No runtime FX conversion — missing currency fails the operation
- `BillingRecord` is immutable — only `status` transitions allowed (`generated` → `paid` | `void`)

**Pricing lifecycle to document:**
```
Catalog price (AgentPrice/ChannelPrice, status: active)
      ↓
Currency resolution (client.billingCurrency)
      ↓
Amount override (optional, admin special pricing)
      ↓
Subscription snapshot (ClientAgent.agentPricing + channels[].pricing)
      ↓
Billing snapshot (BillingRecord, immutable)
```

**Orchestrator flow to document:**
```
1. Idempotency check
2. Route resolution
3. Credentials guard
4. Agent active check
5. Quota enforcement gate  ← NEW
6. Build AgentContext
7. Resolve contact
8. Resolve conversation
9. Call AgentService
10. Return reply
```
