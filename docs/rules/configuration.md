# Configuration & Bootstrap Rules

## ValidationPipe

The global `ValidationPipe()` in `main.ts` uses **default options**:

```typescript
app.useGlobalPipes(new ValidationPipe());
```

Do NOT add `whitelist`, `transform`, `forbidNonWhitelisted`, or other options without explicit instruction. Changing these defaults affects all endpoints.

## Logging

Use NestJS `Logger` class, not `console.log`:

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async doSomething() {
    this.logger.log('Something happened');
    this.logger.warn('Warning message');
    this.logger.error('Error message');
  }
}
```

## DatabaseModule

`DatabaseModule` is `@Global()` — feature modules do NOT need to import it to access repositories.

```typescript
// DON'T do this — DatabaseModule is global
@Module({
  imports: [DatabaseModule],  // ❌ unnecessary
  providers: [MyService],
})
export class MyModule {}

// DO this — repos are auto-available
@Module({
  providers: [MyService],  // ✅ can inject any repository
})
export class MyModule {}
```

All schemas and repositories are registered in `DatabaseModule` (`src/database/database.module.ts`). When adding a new schema/repository:
1. Create schema in `src/database/schemas/`
2. Create repository in `src/database/repositories/`
3. Register both in `DatabaseModule` (add to `MongooseModule.forFeature()` and `repositories` array)

## AI/LLM SDK

LLM calls use the **Vercel AI SDK** (`ai` package):

```typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model,
  system: context.systemPrompt,
  messages,
});
```

Model instantiation goes through `createLLMModel()` in `src/agent/llm/llm.factory.ts`:

```typescript
import { createLLMModel } from '../agent/llm/llm.factory';

const model = createLLMModel({
  provider: LlmProvider.OpenAI,
  apiKey: decryptedApiKey,
  model: 'gpt-4o',
});
```

Supported providers are defined in `src/agent/llm/provider.enum.ts`:

```typescript
export enum LlmProvider {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
}
```

Do NOT import `openai` or `@anthropic-ai/sdk` directly — always go through the factory.

## Allowed Cross-Layer Exception

**SeederService → OnboardingService**
- `SeederService` (in `src/database`) may depend on `OnboardingService` (application layer)
- Uses `forwardRef()` to resolve circular dependency with `OnboardingModule`
- Acceptable because SeederService is infrastructure-only (runs at startup, not in request handling)
