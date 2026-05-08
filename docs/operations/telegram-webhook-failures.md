# Telegram webhook registration failures

Telegram webhook registration jobs that exhaust their retry budget land in the
existing billing dead-letter queue (`BILLING_DLQ_NAME` = the value used by
`DeadLetterService`). This is intentional: on-call inspects the same DLQ used
for billing job failures. A future PR may introduce a per-feature DLQ (`TELEGRAM_DLQ_NAME`)
or a generic name (`JOB_DLQ_NAME`); this is tracked separately.

To inspect failed jobs, follow the existing billing DLQ runbook.

## Hire-lifecycle reconciliation

The `WebhookRegistrationReconciler` (host-only, registered in
`OrchestratorModule` when `WORKER_MODE !== 'true'`) periodically scans for
active Telegram hires whose `webhookRegistration` is missing or stuck in
`pending`, `failed`, or `registering` (older than the stuck cutoff) and
re-enqueues them through `HireChannelLifecyclePublisher.publishProbe` with a
short-retry policy (`{ attempts: 2, backoff: [60_000] }`). After
`WEBHOOK_RECONCILER_QUARANTINE_AFTER_PROBES` reconciler-driven probes
(default: 4), the channel transitions to `quarantined` and is excluded from
future reconciler ticks until manually reset.

### Reconciler env vars

| Env var | Default | Range | Purpose |
|---|---|---|---|
| `WEBHOOK_RECONCILER_INTERVAL_SECONDS` | 60 | 10–3600 | Cron tick interval. Reconciler is `@Cron(EVERY_MINUTE)` by default. |
| `WEBHOOK_RECONCILER_PAGE_SIZE` | 100 | 1–1000 | Max rows per tick. Bounds Mongo and BullMQ load. |
| `WEBHOOK_RECONCILER_QUARANTINE_AFTER_PROBES` | 4 | 1+ | Persisted `attemptCount` threshold at which a row is quarantined. Counts terminal probe outcomes per BullMQ job, not internal retry counts. |

### Quarantine SLA

With Option A (separate short-retry policy for reconciler probes), each probe
consumes ~1m of wall-clock (single 60s backoff between attempt 1 and 2). At
threshold 4 with a 60s tick interval, a stuck Telegram bot is quarantined in
**~6–8 minutes typical, under 30 minutes worst-case**. The post-commit
happy-path enqueue retains the existing 6-attempt curve
`[30s, 2m, 10m, 1h, 6h, 24h]` for resilience; only reconciler-driven probes
use the short curve.

### Metrics & log events

Emitted by the reconciler/publisher (Prometheus-style; counters use `_total`):

- `event=webhook_registration_quarantined botId=<id> attemptCount=<n>` — log
  line emitted whenever a row crosses the quarantine threshold.
- `event=webhook_registration_stuck_registering_reset botId=<id>` — log line
  emitted when the reconciler transitions a stuck-`registering` row to
  `failed` (so the next eligible tick picks it up via `failed → registering`).
- `event=webhook_registration_reconciler_tick_done reconcilable=<n> enqueued=<n> quarantined=<n> stuck_reset=<n> dedup=<n>` — per-tick summary.
- `event=hire_lifecycle_publisher_happy_path_enqueue_failed` — happy-path
  BullMQ enqueue failure (Redis down, etc.). Reconciler will heal.
- `event=hire_lifecycle_publisher_probe_enqueue_failed` — reconciler-driven
  probe enqueue failure.
- `event=hire_pending_stamp_failed` — `ClientAgentsService` or
  `OnboardingService` could not stamp `pending` post-commit; reconciler will
  pick the row up via the `webhookRegistration: { $exists: false }` branch.

### Manual quarantine reset

Quarantined rows are not auto-retried. To reset, either:

1. Run the helper from
   `src/core/persistence/migrations/202605-webhook-registration-pending-default.ts`:

   ```ts
   import { runIfRequested } from '@persistence/migrations/202605-webhook-registration-pending-default';
   await runIfRequested(model, { telegramBotIds: ['1234567890'] });
   ```

2. Or run the CLI script (preferred for ops):

   ```sh
   pnpm --filter pulsar-server exec ts-node \
     scripts/reset-quarantined-telegram-webhook.ts -- 1234567890 9876543210
   ```

3. Or update Mongo directly:

   ```js
   db.client_agents.updateMany(
     {
       'channels.telegramBotId': '1234567890',
       'channels.webhookRegistration.status': 'quarantined',
     },
     {
       $set: {
         'channels.$.webhookRegistration.status': 'pending',
         'channels.$.webhookRegistration.attemptCount': 0,
         'channels.$.webhookRegistration.lastError': null,
       },
     },
   );
   ```

After reset, the next reconciler tick (within 60s) will re-enqueue the probe.

### Downstream consumers (out-of-scope flag)

The `WebhookRegistrationState.status` enum was extended to include `pending`
and `quarantined`. Frontend OpenAPI typings consuming
`ClientAgent.channels[].webhookRegistration.status` MUST be regenerated to
include the new values. Tracked as a separate frontend task.
