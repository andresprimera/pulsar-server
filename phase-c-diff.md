# Phase C: Event Idempotency — Diff

## New Files

### `src/persistence/schemas/processed-event.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'processed_events', timestamps: false })
export class ProcessedEvent extends Document {
  @Prop({ required: true })
  channel: string;

  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true, default: () => new Date() })
  processedAt: Date;
}

export const ProcessedEventSchema =
  SchemaFactory.createForClass(ProcessedEvent);

ProcessedEventSchema.index({ channel: 1, messageId: 1 }, { unique: true });
```

### `src/persistence/repositories/processed-event.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProcessedEvent } from '@persistence/schemas/processed-event.schema';

@Injectable()
export class ProcessedEventRepository {
  constructor(
    @InjectModel(ProcessedEvent.name)
    private readonly model: Model<ProcessedEvent>,
  ) {}

  async create(channel: string, messageId: string): Promise<void> {
    await this.model.create({ channel, messageId });
  }
}
```

### `src/persistence/event-idempotency.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProcessedEventRepository } from '@persistence/repositories/processed-event.repository';

@Injectable()
export class EventIdempotencyService {
  private readonly logger = new Logger(EventIdempotencyService.name);

  constructor(
    private readonly processedEventRepository: ProcessedEventRepository,
  ) {}

  async registerIfFirst(params: {
    channel: string;
    messageId: string;
  }): Promise<boolean> {
    try {
      await this.processedEventRepository.create(
        params.channel,
        params.messageId,
      );
      return true;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.debug(
          `Duplicate event skipped: channel=${params.channel} messageId=${params.messageId}`,
        );
        return false;
      }
      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as any).code === 11000
    );
  }
}
```

### `src/persistence/event-idempotency.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EventIdempotencyService } from './event-idempotency.service';
import { ProcessedEventRepository } from '@persistence/repositories/processed-event.repository';

describe('EventIdempotencyService', () => {
  let service: EventIdempotencyService;
  let repository: jest.Mocked<ProcessedEventRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventIdempotencyService,
        {
          provide: ProcessedEventRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventIdempotencyService>(EventIdempotencyService);
    repository = module.get(ProcessedEventRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerIfFirst', () => {
    it('should return true when event is new', async () => {
      repository.create.mockResolvedValue(undefined);

      const result = await service.registerIfFirst({
        channel: 'whatsapp',
        messageId: 'msg-001',
      });

      expect(result).toBe(true);
      expect(repository.create).toHaveBeenCalledWith('whatsapp', 'msg-001');
    });

    it('should return false when event is a duplicate (Mongo 11000)', async () => {
      const duplicateError = Object.assign(new Error('duplicate key'), {
        code: 11000,
      });
      repository.create.mockRejectedValue(duplicateError);

      const result = await service.registerIfFirst({
        channel: 'whatsapp',
        messageId: 'msg-001',
      });

      expect(result).toBe(false);
    });

    it('should rethrow unexpected errors', async () => {
      const unexpectedError = new Error('connection failed');
      repository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.registerIfFirst({
          channel: 'whatsapp',
          messageId: 'msg-001',
        }),
      ).rejects.toThrow('connection failed');
    });
  });
});
```

## Modified Files

```diff
diff --git a/src/orchestrator/incoming-message.orchestrator.spec.ts b/src/orchestrator/incoming-message.orchestrator.spec.ts
index 7bd68bf..cdf56c9 100644
--- a/src/orchestrator/incoming-message.orchestrator.spec.ts
+++ b/src/orchestrator/incoming-message.orchestrator.spec.ts
@@ -10,6 +10,7 @@ import { AgentRoutingService } from '@domain/routing/agent-routing.service';
 import { AgentContextService } from '@agent/agent-context.service';
 import { ContactIdentityResolver } from '@channels/shared/contact-identity.resolver';
 import { ConversationService } from '@domain/conversation/conversation.service';
+import { EventIdempotencyService } from '@persistence/event-idempotency.service';
 
 describe('IncomingMessageOrchestrator', () => {
   let service: IncomingMessageOrchestrator;
@@ -18,6 +19,7 @@ describe('IncomingMessageOrchestrator', () => {
   let agentRepository: jest.Mocked<AgentRepository>;
   let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
   let conversationService: jest.Mocked<ConversationService>;
+  let eventIdempotencyService: jest.Mocked<EventIdempotencyService>;
   let loggerWarnSpy: jest.SpyInstance;
 
   const createEvent = (overrides: any = {}) => ({
@@ -77,6 +79,12 @@ describe('IncomingMessageOrchestrator', () => {
             touch: jest.fn(),
           },
         },
+        {
+          provide: EventIdempotencyService,
+          useValue: {
+            registerIfFirst: jest.fn().mockResolvedValue(true),
+          },
+        },
       ],
     }).compile();
 
@@ -88,6 +96,7 @@ describe('IncomingMessageOrchestrator', () => {
     agentRepository = module.get(AgentRepository);
     contactIdentityResolver = module.get(ContactIdentityResolver);
     conversationService = module.get(ConversationService);
+    eventIdempotencyService = module.get(EventIdempotencyService);
 
     loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
   });
@@ -225,6 +234,18 @@ describe('IncomingMessageOrchestrator', () => {
       expect(conversationService.touch).toHaveBeenCalledTimes(1);
     });
 
+    it('returns empty object and skips agent when event is duplicate', async () => {
+      eventIdempotencyService.registerIfFirst.mockResolvedValue(false);
+
+      const output = await service.handle(createEvent());
+
+      expect(output).toEqual({});
+      expect(agentService.run).not.toHaveBeenCalled();
+      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
+      expect(conversationService.resolveOrCreate).not.toHaveBeenCalled();
+      expect(conversationService.touch).not.toHaveBeenCalled();
+    });
+
     it('touches conversation and rethrows when agent run fails', async () => {
       agentRoutingService.resolveRoute.mockResolvedValue(
         mockResolvedRoute as any,
diff --git a/src/orchestrator/incoming-message.orchestrator.ts b/src/orchestrator/incoming-message.orchestrator.ts
index 3c5d2a7..d79a466 100644
--- a/src/orchestrator/incoming-message.orchestrator.ts
+++ b/src/orchestrator/incoming-message.orchestrator.ts
@@ -17,6 +17,7 @@ import {
   RouteCandidate,
 } from '@domain/routing/agent-routing.service';
 import { ConversationService } from '@domain/conversation/conversation.service';
+import { EventIdempotencyService } from '@persistence/event-idempotency.service';
 
 @Injectable()
 export class IncomingMessageOrchestrator {
@@ -30,11 +31,24 @@ export class IncomingMessageOrchestrator {
     private readonly agentContextService: AgentContextService,
     private readonly contactIdentityResolver: ContactIdentityResolver,
     private readonly conversationService: ConversationService,
+    private readonly eventIdempotencyService: EventIdempotencyService,
   ) {}
 
   async handle(event: IncomingChannelEvent): Promise<AgentOutput | undefined> {
     const logPrefix = this.getLogPrefix(event.channelId);
 
+    const isFirst = await this.eventIdempotencyService.registerIfFirst({
+      channel: event.channelId,
+      messageId: event.messageId,
+    });
+
+    if (!isFirst) {
+      this.logger.log(
+        `[${logPrefix}] Duplicate event detected for channel=${event.channelId} messageId=${event.messageId}`,
+      );
+      return {};
+    }
+
     const routeDecision = await this.agentRoutingService.resolveRoute({
       routeChannelIdentifier: event.routeChannelIdentifier,
       channelIdentifier: event.channelIdentifier,
diff --git a/src/persistence/database.module.ts b/src/persistence/database.module.ts
index 0c4123e..ca9dfec 100644
--- a/src/persistence/database.module.ts
+++ b/src/persistence/database.module.ts
@@ -25,6 +25,12 @@ import {
   ConversationSchema,
 } from './schemas/conversation.schema';
 import { ConversationRepository } from './repositories/conversation.repository';
+import {
+  ProcessedEvent,
+  ProcessedEventSchema,
+} from './schemas/processed-event.schema';
+import { ProcessedEventRepository } from './repositories/processed-event.repository';
+import { EventIdempotencyService } from './event-idempotency.service';
 import { OnboardingModule } from '@onboarding/onboarding.module';
 
 const repositories = [
@@ -38,6 +44,7 @@ const repositories = [
   UserRepository,
   MessageRepository,
   ConversationRepository,
+  ProcessedEventRepository,
 ];
 
 @Global()
@@ -63,10 +70,11 @@ const repositories = [
       { name: User.name, schema: UserSchema },
       { name: Message.name, schema: MessageSchema },
       { name: Conversation.name, schema: ConversationSchema },
+      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
     ]),
     forwardRef(() => OnboardingModule),
   ],
-  providers: [...repositories, SeederService],
-  exports: repositories,
+  providers: [...repositories, SeederService, EventIdempotencyService],
+  exports: [...repositories, EventIdempotencyService],
 })
 export class DatabaseModule {}
```
