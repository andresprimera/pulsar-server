Phase B — Migrate Other Channels One by One

Each channel:

Replace inline logic with orchestrator call.

Keep adapter thin.

Re-run tests.

Deploy.

Incremental migration reduces blast radius.

Phase C — Introduce Channel-Aware Timeout Policy

Small refactor:

resolveOrCreate(params, timeoutMs)

No behavior change for WhatsApp.

Deploy.

Phase D — Conversation Summary Compression

This is isolated to:

ConversationService

MessagePersistenceService

ContextEnricher

No need to touch channels.

Deploy.