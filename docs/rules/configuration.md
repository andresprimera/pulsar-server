# Configuration Rules

`docs/rules/ARCHITECTURE_CONTRACT.md` has higher priority than this file.

## Enforced defaults
- Global validation pipe must remain `new ValidationPipe()` with default options unless explicitly requested.
- Use NestJS `Logger`, not `console.log`.
- Do not add direct SDK clients for LLM providers in feature code.
- LLM calls must use the shared `ai` SDK flow and the central model factory in the agent layer.

## Module wiring
- Persistence/repository providers are registered once in the global database/persistence module.
- Feature modules should not duplicate imports of that global module unless required by a specific exception.

## Allowed exception
- `SeederService -> OnboardingService` cross-layer dependency is allowed only for startup seeding flow.
