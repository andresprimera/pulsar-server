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