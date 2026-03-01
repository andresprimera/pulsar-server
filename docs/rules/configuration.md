# Configuration Rules

ARCHITECTURE_CONTRACT.md has higher priority.

## Enforced Defaults

- Use NestJS Logger (no console.log).
- LLM calls must go through AgentService.
- No direct provider SDK usage outside agent layer.
- Global validation pipe remains default unless explicitly changed.

## Module Wiring

- Persistence module is global and registered once.
- Feature modules must not duplicate persistence imports.
- Orchestrator coordinates cross-layer interactions.

## Event Lifecycle Integrity

- All inbound channels must delegate to orchestrator.
- Idempotency must execute before routing.
- No feature may bypass orchestrator for inbound processing.

## Allowed Exception

- SeederService → OnboardingService cross-layer allowed only for startup seeding.