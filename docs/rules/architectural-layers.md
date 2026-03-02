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