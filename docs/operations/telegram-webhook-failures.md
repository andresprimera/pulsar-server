# Telegram webhook registration failures

Telegram webhook registration jobs that exhaust their retry budget land in the
existing billing dead-letter queue (`BILLING_DLQ_NAME` = the value used by
`DeadLetterService`). This is intentional: on-call inspects the same DLQ used
for billing job failures. A future PR may introduce a per-feature DLQ (`TELEGRAM_DLQ_NAME`)
or a generic name (`JOB_DLQ_NAME`); this is tracked separately.

To inspect failed jobs, follow the existing billing DLQ runbook.
