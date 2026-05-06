# Pulsar Architectural Layers

Channels (Transport)
        ↓
Orchestrator (Coordination)
        ↓
        ├── Domain (Routing + Conversation Rules)
        └── Agent (LLM Execution)
                 ↓
             Persistence (Database)

Key Concepts:

- Transport is stateless.
- Orchestrator owns lifecycle.
- Agent owns AI execution.
- Domain owns business invariants.
- Persistence owns atomic guarantees.
- Idempotency is enforced before any business logic.
- Conversation memory is bounded via summary compression.

Inbound message flow (orchestrator):

1. Idempotency check
2. Route resolution
3. Credentials guard
4. Agent active check
5. Quota enforcement gate
6. Build AgentContext
7. Agent execution (contact resolution, conversation resolution, AgentService)

Inbound webhook authentication (transport → orchestrator, read-only persistence):

- Transport parses the webhook and must not import repositories.
- For Telegram, the coordination layer may perform a read-only hire lookup (for example `findActiveByTelegramBotIdForWebhookAuth`) and compare `X-Telegram-Bot-Api-Secret-Token` to stored `telegramWebhookSecretHex` on `HireChannelConfig` — no `credentials` decrypt. See `docs/rules/credential-encryption.md`.

Outbound message flow (gateway):

```
MessagingGatewayService
    ↓
ChannelRouter (resolves channel → adapter)
    ↓
ChannelAdapter (e.g. WhatsAppChannelService)
    ↓
ProviderRouter → ProviderAdapter
```

- `ChannelAdapter` is the interface every channel implements.
- `@ChannelAdapterProvider()` decorator marks a class for automatic discovery.
- `ChannelRouter` auto-discovers adapters via `DiscoveryService` at module init.
- `MessagingGatewayService` is the single outbound entry point.
- Gateway contains no business logic --- pure routing and delegation.
- Adding a new channel: (1) implement `ChannelAdapter`, (2) decorate with `@ChannelAdapterProvider()`, (3) import channel module in `MessagingGatewayModule`.