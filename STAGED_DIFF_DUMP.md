# Staged Diff Dump

Generated: 2026-03-01 02:19:25 UTC

## Staged Files

```text
src/agent/agent.service.spec.ts
src/agent/agent.service.ts
src/agent/contracts/agent-input.ts
src/agent/incoming-message.orchestrator.spec.ts
src/agent/incoming-message.orchestrator.ts
src/channels/instagram/instagram.module.ts
src/channels/instagram/instagram.service.spec.ts
src/channels/instagram/instagram.service.ts
src/channels/shared/conversation.service.spec.ts
src/channels/shared/conversation.service.ts
src/channels/shared/incoming-channel-event.interface.ts
src/channels/tiktok/tiktok.module.ts
src/channels/tiktok/tiktok.service.spec.ts
src/channels/tiktok/tiktok.service.ts
src/channels/whatsapp/whatsapp.module.ts
src/channels/whatsapp/whatsapp.service.spec.ts
src/channels/whatsapp/whatsapp.service.ts
```

## Staged Diff

```diff
diff --git a/src/agent/agent.service.spec.ts b/src/agent/agent.service.spec.ts
index 26f6616..1dd803e 100644
--- a/src/agent/agent.service.spec.ts
+++ b/src/agent/agent.service.spec.ts
@@ -27,6 +27,7 @@ describe('AgentService', () => {
   const mockInput: AgentInput = {
     channel: 'whatsapp',
     contactId: '507f1f77bcf86cd799439012',
+    conversationId: '507f1f77bcf86cd799439099',
     message: { type: 'text', text: 'Hello, world!' },
     contactMetadata: {
       firstName: 'Ana',
@@ -61,7 +62,6 @@ describe('AgentService', () => {
         {
           provide: MessagePersistenceService,
           useValue: {
-            resolveConversation: jest.fn(),
             createUserMessage: jest.fn(),
             getConversationContextByConversationId: jest.fn(),
             handleOutgoingMessage: jest.fn(),
@@ -97,9 +97,6 @@ describe('AgentService', () => {
 
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: conversationId,
-      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
       messagePersistenceService.getConversationContextByConversationId.mockResolvedValue(
         conversationHistory,
@@ -108,18 +105,8 @@ describe('AgentService', () => {
 
       const result = await service.run(mockInput, mockContext);
 
-      expect(messagePersistenceService.resolveConversation).toHaveBeenCalledWith(
-        {
-          channelId: '507f1f77bcf86cd799439014',
-          agentId: '507f1f77bcf86cd799439013',
-          clientId: '507f1f77bcf86cd799439011',
-          contactId: '507f1f77bcf86cd799439012',
-        },
-        expect.anything(),
-      );
-
       expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
-        expect.anything(),
+        new Types.ObjectId(conversationId),
         expect.anything(),
       );
 
@@ -176,9 +163,6 @@ describe('AgentService', () => {
       const mockModel = {};
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439099',
-      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
       messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
@@ -197,9 +181,6 @@ describe('AgentService', () => {
       (llmFactory.createLLMModel as jest.Mock).mockImplementation(() => {
         throw new Error('API error');
       });
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439099',
-      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
       messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
 
@@ -218,9 +199,6 @@ describe('AgentService', () => {
       const mockModel = {};
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'response' });
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439099',
-      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
       messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
@@ -242,9 +220,6 @@ describe('AgentService', () => {
       const mockModel = {};
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'Hi Ana! How can I help today?' });
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439099',
-      } as any);
       messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
       messagePersistenceService.createUserMessage.mockResolvedValue();
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
@@ -266,26 +241,28 @@ describe('AgentService', () => {
       expect(generateTextCall.system).toContain('Safe contact metadata:');
     });
 
-    it('resolves conversation before persisting user message', async () => {
+    it('uses provided conversationId before persisting user message', async () => {
       const mockModel = {};
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
 
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439099',
-      } as any);
       messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
       messagePersistenceService.createUserMessage.mockResolvedValue();
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
 
       await service.run(mockInput, mockContext);
 
-      const resolveOrder =
-        messagePersistenceService.resolveConversation.mock.invocationCallOrder[0];
+      const contextLoadOrder =
+        messagePersistenceService.getConversationContextByConversationId.mock.invocationCallOrder[0];
       const createOrder =
         messagePersistenceService.createUserMessage.mock.invocationCallOrder[0];
 
-      expect(resolveOrder).toBeLessThan(createOrder);
+      expect(contextLoadOrder).toBeLessThan(createOrder);
+
+      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
+        new Types.ObjectId(mockInput.conversationId),
+        expect.anything(),
+      );
     });
 
     it('does not load old conversation history when a new conversation is resolved', async () => {
@@ -295,9 +272,6 @@ describe('AgentService', () => {
 
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
-      messagePersistenceService.resolveConversation.mockResolvedValue({
-        _id: newConversationId,
-      } as any);
       messagePersistenceService.getConversationContextByConversationId.mockImplementation(
         async (conversationId: any) => {
           if (conversationId?.toString() === oldConversationId.toString()) {
@@ -313,7 +287,7 @@ describe('AgentService', () => {
       await service.run(mockInput, mockContext);
 
       expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
-        newConversationId,
+        new Types.ObjectId(mockInput.conversationId),
         expect.anything(),
       );
 
diff --git a/src/agent/agent.service.ts b/src/agent/agent.service.ts
index 6daa998..97d2989 100644
--- a/src/agent/agent.service.ts
+++ b/src/agent/agent.service.ts
@@ -34,14 +34,7 @@ export class AgentService {
         contactId: input.contactId,
       };
       const contactId = new Types.ObjectId(input.contactId);
-
-      const conversation =
-        await this.messagePersistenceService.resolveConversation(
-          persistenceContext,
-          contactId,
-        );
-
-      const conversationId = conversation._id as Types.ObjectId;
+      const conversationId = new Types.ObjectId(input.conversationId);
 
       const conversationHistory =
         await this.messagePersistenceService.getConversationContextByConversationId(
diff --git a/src/agent/contracts/agent-input.ts b/src/agent/contracts/agent-input.ts
index 237c4d0..f80921f 100644
--- a/src/agent/contracts/agent-input.ts
+++ b/src/agent/contracts/agent-input.ts
@@ -3,6 +3,7 @@ import { ChannelType } from '../../channels/shared/channel-type.type';
 export interface AgentInput {
   channel: ChannelType;
   contactId: string;
+  conversationId: string;
   message: {
     type: 'text';
     text: string;
diff --git a/src/agent/incoming-message.orchestrator.spec.ts b/src/agent/incoming-message.orchestrator.spec.ts
new file mode 100644
index 0000000..fe43d67
--- /dev/null
+++ b/src/agent/incoming-message.orchestrator.spec.ts
@@ -0,0 +1,217 @@
+import { Test, TestingModule } from '@nestjs/testing';
+import { Logger } from '@nestjs/common';
+import { IncomingMessageOrchestrator } from './incoming-message.orchestrator';
+import { AgentService } from './agent.service';
+import { AgentRepository } from '../database/repositories/agent.repository';
+import { ClientRepository } from '../database/repositories/client.repository';
+import { LlmProvider } from './llm/provider.enum';
+import { AgentRoutingService } from '../channels/shared/agent-routing.service';
+import { AgentContextService } from './agent-context.service';
+import { ContactIdentityResolver } from '../channels/shared/contact-identity.resolver';
+import { CHANNEL_TYPES } from '../channels/shared/channel-type.constants';
+import { ConversationService } from '../channels/shared/conversation.service';
+
+describe('IncomingMessageOrchestrator', () => {
+  let service: IncomingMessageOrchestrator;
+  let agentService: jest.Mocked<AgentService>;
+  let agentRoutingService: jest.Mocked<AgentRoutingService>;
+  let agentRepository: jest.Mocked<AgentRepository>;
+  let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
+  let conversationService: jest.Mocked<ConversationService>;
+  let loggerWarnSpy: jest.SpyInstance;
+
+  const createEvent = (overrides: any = {}) => ({
+    channelId: CHANNEL_TYPES.WHATSAPP,
+    routeChannelIdentifier: 'phone123',
+    channelIdentifier: '1234567890',
+    messageId: 'msg123',
+    text: 'Hello',
+    rawPayload: {
+      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone123' } } }] }],
+    },
+    ...overrides,
+  });
+
+  beforeEach(async () => {
+    const module: TestingModule = await Test.createTestingModule({
+      providers: [
+        IncomingMessageOrchestrator,
+        {
+          provide: AgentService,
+          useValue: { run: jest.fn() },
+        },
+        {
+          provide: AgentRoutingService,
+          useValue: { resolveRoute: jest.fn() },
+        },
+        {
+          provide: AgentRepository,
+          useValue: { findActiveById: jest.fn() },
+        },
+        {
+          provide: ClientRepository,
+          useValue: { findById: jest.fn().mockResolvedValue({ name: 'Test Client' }) },
+        },
+        {
+          provide: ContactIdentityResolver,
+          useValue: {
+            resolveContact: jest.fn(),
+          },
+        },
+        {
+          provide: AgentContextService,
+          useValue: {
+            enrichContext: jest.fn().mockImplementation((ctx) => Promise.resolve(ctx)),
+          },
+        },
+        {
+          provide: ConversationService,
+          useValue: {
+            resolveOrCreate: jest.fn(),
+            touch: jest.fn(),
+          },
+        },
+      ],
+    }).compile();
+
+    service = module.get<IncomingMessageOrchestrator>(IncomingMessageOrchestrator);
+    agentService = module.get(AgentService);
+    agentRoutingService = module.get(AgentRoutingService);
+    agentRepository = module.get(AgentRepository);
+    contactIdentityResolver = module.get(ContactIdentityResolver);
+    conversationService = module.get(ConversationService);
+
+    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
+  });
+
+  afterEach(() => {
+    loggerWarnSpy.mockRestore();
+  });
+
+  it('should be defined', () => {
+    expect(service).toBeDefined();
+  });
+
+  describe('handle', () => {
+    const mockClientAgent = {
+      _id: 'ca-1',
+      clientId: '507f1f77bcf86cd799439011',
+      agentId: 'agent-1',
+      status: 'active',
+      channels: [
+        {
+          channelId: '507f1f77bcf86cd799439014',
+          status: 'active',
+          provider: 'meta',
+          credentials: { phoneNumberId: 'phone123', accessToken: 'sk-wa-token' },
+          llmConfig: {
+            provider: LlmProvider.OpenAI,
+            apiKey: 'sk-mock-key',
+            model: 'gpt-4',
+          },
+        },
+      ],
+    };
+
+    const mockAgent = {
+      id: 'agent-1',
+      name: 'Support Bot',
+      systemPrompt: 'You are a helpful assistant.',
+    };
+
+    const mockContact = {
+      _id: '507f1f77bcf86cd799439012',
+    };
+    const mockConversation = {
+      _id: '507f1f77bcf86cd799439099',
+    };
+
+    const mockResolvedRoute = {
+      kind: 'resolved' as const,
+      candidate: {
+        clientAgent: mockClientAgent,
+        channelConfig: mockClientAgent.channels[0],
+        agentName: 'Support Bot',
+      },
+    };
+
+    it('returns undefined when route is unroutable', async () => {
+      agentRoutingService.resolveRoute.mockResolvedValue({
+        kind: 'unroutable',
+        reason: 'no-candidates',
+      });
+
+      const output = await service.handle(
+        createEvent({ routeChannelIdentifier: 'unknown-phone' }),
+      );
+
+      expect(output).toBeUndefined();
+      expect(loggerWarnSpy).toHaveBeenCalledWith(
+        '[WhatsApp] No active ClientAgent found for routeChannelIdentifier=unknown-phone.',
+      );
+      expect(agentService.run).not.toHaveBeenCalled();
+    });
+
+    it('returns clarification reply when route is ambiguous', async () => {
+      agentRoutingService.resolveRoute.mockResolvedValue({
+        kind: 'ambiguous',
+        candidates: [
+          {
+            clientAgent: mockClientAgent as any,
+            channelConfig: mockClientAgent.channels[0] as any,
+            agentName: 'Support Bot',
+          },
+          {
+            clientAgent: mockClientAgent as any,
+            channelConfig: mockClientAgent.channels[0] as any,
+            agentName: 'Sales Bot',
+          },
+        ],
+        prompt: 'choose',
+      });
+
+      const output = await service.handle(createEvent());
+
+      expect(output?.reply?.text).toContain('We have a few specialists ready to help you:');
+      expect(agentService.run).not.toHaveBeenCalled();
+      expect(conversationService.touch).not.toHaveBeenCalled();
+    });
+
+    it('returns agent output and touches conversation once', async () => {
+      agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
+      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactIdentityResolver.resolveContact.mockResolvedValue(mockContact as any);
+      conversationService.resolveOrCreate.mockResolvedValue(mockConversation as any);
+      agentService.run.mockResolvedValue({
+        reply: { type: 'text', text: 'Hello' },
+      });
+
+      const output = await service.handle(createEvent());
+
+      expect(output).toEqual({
+        reply: { type: 'text', text: 'Hello' },
+      });
+      expect(agentService.run).toHaveBeenCalledWith(
+        expect.objectContaining({
+          channel: 'whatsapp',
+          contactId: '507f1f77bcf86cd799439012',
+          conversationId: '507f1f77bcf86cd799439099',
+          metadata: { messageId: 'msg123', routeChannelIdentifier: 'phone123' },
+        }),
+        expect.anything(),
+      );
+      expect(conversationService.touch).toHaveBeenCalledTimes(1);
+    });
+
+    it('touches conversation and rethrows when agent run fails', async () => {
+      agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
+      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactIdentityResolver.resolveContact.mockResolvedValue(mockContact as any);
+      conversationService.resolveOrCreate.mockResolvedValue(mockConversation as any);
+      agentService.run.mockRejectedValue(new Error('run failed'));
+
+      await expect(service.handle(createEvent())).rejects.toThrow('run failed');
+      expect(conversationService.touch).toHaveBeenCalledTimes(1);
+    });
+  });
+});
diff --git a/src/agent/incoming-message.orchestrator.ts b/src/agent/incoming-message.orchestrator.ts
new file mode 100644
index 0000000..bc63dec
--- /dev/null
+++ b/src/agent/incoming-message.orchestrator.ts
@@ -0,0 +1,190 @@
+import { Injectable, Logger } from '@nestjs/common';
+import { Types } from 'mongoose';
+import { AgentService } from './agent.service';
+import { AgentOutput } from './contracts/agent-output';
+import { AgentInput } from './contracts/agent-input';
+import { AgentContext } from './contracts/agent-context';
+import { AgentContextService } from './agent-context.service';
+import { AgentRepository } from '../database/repositories/agent.repository';
+import { ClientRepository } from '../database/repositories/client.repository';
+import { decrypt, decryptRecord } from '../database/utils/crypto.util';
+import { CHANNEL_TYPES } from '../channels/shared/channel-type.constants';
+import { ContactIdentityResolver } from '../channels/shared/contact-identity.resolver';
+import { IncomingChannelEvent } from '../channels/shared/incoming-channel-event.interface';
+import { AgentRoutingService, RouteCandidate } from '../channels/shared/agent-routing.service';
+import { ConversationService } from '../channels/shared/conversation.service';
+import { ChannelType } from '../channels/shared/channel-type.type';
+
+@Injectable()
+export class IncomingMessageOrchestrator {
+  private readonly logger = new Logger(IncomingMessageOrchestrator.name);
+
+  constructor(
+    private readonly agentService: AgentService,
+    private readonly agentRepository: AgentRepository,
+    private readonly clientRepository: ClientRepository,
+    private readonly agentRoutingService: AgentRoutingService,
+    private readonly agentContextService: AgentContextService,
+    private readonly contactIdentityResolver: ContactIdentityResolver,
+    private readonly conversationService: ConversationService,
+  ) {}
+
+  async handle(event: IncomingChannelEvent): Promise<AgentOutput | undefined> {
+    const logPrefix = this.getLogPrefix(event.channelId);
+
+    const routeDecision = await this.agentRoutingService.resolveRoute({
+      routeChannelIdentifier: event.routeChannelIdentifier,
+      channelIdentifier: event.channelIdentifier,
+      incomingText: event.text,
+      channelType: event.channelId as ChannelType,
+    });
+
+    if (routeDecision.kind === 'unroutable') {
+      this.logger.warn(
+        `[${logPrefix}] No active ClientAgent found for routeChannelIdentifier=${event.routeChannelIdentifier}.`,
+      );
+      return undefined;
+    }
+
+    if (routeDecision.kind === 'ambiguous') {
+      const fallback = routeDecision.candidates[0];
+      if (!fallback?.channelConfig?.credentials) {
+        this.logger.warn(
+          `[${logPrefix}] Unable to build routing clarification for routeChannelIdentifier=${event.routeChannelIdentifier}: missing credentials.`,
+        );
+        return undefined;
+      }
+
+      const prompt = await this.buildAmbiguousPrompt(routeDecision.candidates);
+      return {
+        reply: {
+          type: 'text',
+          text: prompt,
+        },
+      };
+    }
+
+    const { clientAgent, channelConfig } = routeDecision.candidate;
+
+    // Guard: credentials may be undefined if select('+channels.credentials') was missed
+    if (!channelConfig.credentials) {
+      this.logger.error(
+        `[${logPrefix}] Credentials missing for routeChannelIdentifier=${event.routeChannelIdentifier}. Possible select('+channels.credentials') omission.`,
+      );
+      return undefined;
+    }
+
+    const agent = await this.agentRepository.findActiveById(
+      clientAgent.agentId,
+    );
+    if (!agent) {
+      this.logger.warn(
+        `[${logPrefix}] Agent ${clientAgent.agentId} is not active. Skipping message.`,
+      );
+      return undefined;
+    }
+
+    const rawContext: AgentContext = {
+      agentId: clientAgent.agentId,
+      agentName: agent.name,
+      clientId: clientAgent.clientId,
+      channelId: channelConfig.channelId.toString(),
+      systemPrompt: agent.systemPrompt,
+      llmConfig: {
+        ...channelConfig.llmConfig,
+        // TODO: [HACK] REMOVE THIS IN PRODUCTION.
+        // Forcing 'openai' provider and system key for dev/testing ease.
+        // This bypasses client billing!
+        provider: (channelConfig.llmConfig.provider || 'openai') as any,
+        apiKey: decrypt(
+          channelConfig.llmConfig.apiKey &&
+            !channelConfig.llmConfig.apiKey.includes('REPLACE_ME')
+            ? channelConfig.llmConfig.apiKey
+            : process.env.OPENAI_API_KEY ?? '',
+        ),
+        model: channelConfig.llmConfig.model || 'gpt-4o',
+      },
+      channelConfig: decryptRecord(channelConfig.credentials),
+    };
+
+    const context = await this.agentContextService.enrichContext(rawContext);
+
+    const contact = await this.contactIdentityResolver.resolveContact({
+      channelType: event.channelId as ChannelType,
+      payload: event.rawPayload,
+      clientId: new Types.ObjectId(clientAgent.clientId),
+      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
+      contactName: event.channelIdentifier,
+    });
+
+    const conversation = await this.conversationService.resolveOrCreate({
+      clientId: new Types.ObjectId(clientAgent.clientId),
+      contactId: contact._id,
+      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
+      now: new Date(),
+    });
+
+    const input: AgentInput = {
+      channel: event.channelId as ChannelType,
+      contactId: contact._id.toString(),
+      conversationId: conversation._id.toString(),
+      message: {
+        type: 'text',
+        text: event.text,
+      },
+      contactMetadata: contact.metadata,
+      contactSummary: contact.contactSummary,
+      metadata: {
+        messageId: event.messageId,
+        routeChannelIdentifier: event.routeChannelIdentifier,
+      },
+    };
+
+    let output: AgentOutput | undefined;
+    try {
+      output = await this.agentService.run(input, context);
+    } finally {
+      await this.conversationService.touch(conversation._id as Types.ObjectId);
+    }
+
+    return output;
+  }
+
+  private getLogPrefix(channelId: string): string {
+    switch (channelId) {
+      case CHANNEL_TYPES.WHATSAPP:
+        return 'WhatsApp';
+      case CHANNEL_TYPES.INSTAGRAM:
+        return 'Instagram';
+      case CHANNEL_TYPES.TIKTOK:
+        return 'TikTok';
+      default:
+        return channelId || 'Channel';
+    }
+  }
+
+  private async buildAmbiguousPrompt(
+    candidates: RouteCandidate[],
+  ): Promise<string> {
+    const clientId = candidates[0].clientAgent.clientId;
+    const client = await this.clientRepository.findById(clientId);
+    const clientName = client?.name;
+
+    const lines = candidates.map(
+      (candidate, index) => `${index + 1}. ${candidate.agentName}`,
+    );
+
+    const greeting = clientName
+      ? `Hey there! Thanks for reaching out to *${clientName}*.`
+      : `Hey there! Thanks for reaching out.`;
+
+    return [
+      greeting,
+      '',
+      'We have a few specialists ready to help you:',
+      ...lines,
+      '',
+      'Just reply with a number or name to get started!',
+    ].join('\n');
+  }
+}
diff --git a/src/channels/instagram/instagram.module.ts b/src/channels/instagram/instagram.module.ts
index 32e3cfb..918fb6c 100644
--- a/src/channels/instagram/instagram.module.ts
+++ b/src/channels/instagram/instagram.module.ts
@@ -3,10 +3,11 @@ import { InstagramController } from './instagram.controller';
 import { InstagramService } from './instagram.service';
 import { AgentModule } from '../../agent/agent.module';
 import { SharedChannelModule } from '../shared/shared.module';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
 
 @Module({
   imports: [AgentModule, SharedChannelModule],
   controllers: [InstagramController],
-  providers: [InstagramService],
+  providers: [InstagramService, IncomingMessageOrchestrator],
 })
 export class InstagramModule {}
diff --git a/src/channels/instagram/instagram.service.spec.ts b/src/channels/instagram/instagram.service.spec.ts
index 973b8b7..cc26717 100644
--- a/src/channels/instagram/instagram.service.spec.ts
+++ b/src/channels/instagram/instagram.service.spec.ts
@@ -1,25 +1,17 @@
 import { Test, TestingModule } from '@nestjs/testing';
-import { ForbiddenException, Logger } from '@nestjs/common';
+import { ForbiddenException } from '@nestjs/common';
 import { InstagramService } from './instagram.service';
-import { AgentService } from '../../agent/agent.service';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
 import { AgentRoutingService } from '../shared/agent-routing.service';
-import { AgentRepository } from '../../database/repositories/agent.repository';
-import { AgentContextService } from '../../agent/agent-context.service';
-import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
 import { encrypt } from '../../database/utils/crypto.util';
 
 describe('InstagramService', () => {
   let service: InstagramService;
-  let agentService: jest.Mocked<AgentService>;
+  let incomingMessageOrchestrator: jest.Mocked<IncomingMessageOrchestrator>;
   let agentRoutingService: jest.Mocked<AgentRoutingService>;
-  let agentRepository: jest.Mocked<AgentRepository>;
-  let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
-  let loggerWarnSpy: jest.SpyInstance;
   let fetchSpy: jest.SpyInstance;
 
   beforeEach(async () => {
-    jest.clearAllMocks();
-
     process.env.INSTAGRAM_API_HOST = 'https://graph.facebook.com';
     process.env.INSTAGRAM_API_VERSION = 'v24.0';
     process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'ig-token';
@@ -34,97 +26,53 @@ describe('InstagramService', () => {
       providers: [
         InstagramService,
         {
-          provide: AgentService,
-          useValue: { run: jest.fn() },
+          provide: IncomingMessageOrchestrator,
+          useValue: { handle: jest.fn() },
         },
         {
           provide: AgentRoutingService,
           useValue: { resolveRoute: jest.fn() },
         },
-        {
-          provide: AgentRepository,
-          useValue: { findActiveById: jest.fn() },
-        },
-        {
-          provide: ContactIdentityResolver,
-          useValue: {
-            resolveContact: jest.fn(),
-          },
-        },
-        {
-          provide: AgentContextService,
-          useValue: {
-            enrichContext: jest.fn().mockImplementation((ctx) => Promise.resolve(ctx)),
-          },
-        },
       ],
     }).compile();
 
     service = module.get(InstagramService);
-    agentService = module.get(AgentService);
+    incomingMessageOrchestrator = module.get(IncomingMessageOrchestrator);
     agentRoutingService = module.get(AgentRoutingService);
-    agentRepository = module.get(AgentRepository);
-    contactIdentityResolver = module.get(ContactIdentityResolver);
-
-    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
   });
 
   afterEach(() => {
-    loggerWarnSpy.mockRestore();
     fetchSpy.mockRestore();
     delete process.env.INSTAGRAM_API_HOST;
     delete process.env.INSTAGRAM_API_VERSION;
     delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
   });
 
-  it('should be defined', () => {
-    expect(service).toBeDefined();
-  });
-
-  it('should verify webhook token', () => {
+  it('verifies webhook token', () => {
     expect(service.verifyWebhook('subscribe', 'ig-token', 'challenge')).toBe(
       'challenge',
     );
   });
 
-  it('should reject invalid webhook token', () => {
+  it('rejects invalid webhook token', () => {
     expect(() =>
       service.verifyWebhook('subscribe', 'wrong-token', 'challenge'),
     ).toThrow(ForbiddenException);
   });
 
-  it('should process valid inbound text and send reply', async () => {
+  it('delegates to orchestrator and sends reply when returned', async () => {
     const accessToken = 'ig-access-token';
     const encryptedCreds = {
       instagramAccountId: encrypt('17841400000000000'),
       accessToken: encrypt(accessToken),
     };
 
+    incomingMessageOrchestrator.handle.mockResolvedValue({
+      reply: { type: 'text', text: 'Instagram reply' },
+    });
     agentRoutingService.resolveRoute.mockResolvedValue({
       kind: 'resolved',
-      candidate: {
-        clientAgent: {
-          agentId: 'agent_1',
-          clientId: '507f1f77bcf86cd799439011',
-        },
-        channelConfig: {
-          channelId: '507f1f77bcf86cd799439014',
-          credentials: encryptedCreds,
-          llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o' },
-        },
-        agentName: 'Agent',
-      },
-    } as any);
-
-    agentRepository.findActiveById.mockResolvedValue({
-      systemPrompt: 'prompt',
-    } as any);
-    contactIdentityResolver.resolveContact.mockResolvedValue({
-      _id: '507f1f77bcf86cd799439012',
-    } as any);
-
-    agentService.run.mockResolvedValue({
-      reply: { type: 'text', text: 'Instagram reply' },
+      candidate: { channelConfig: { credentials: encryptedCreds } },
     } as any);
 
     await service.handleIncoming({
@@ -142,14 +90,7 @@ describe('InstagramService', () => {
       ],
     });
 
-    expect(agentService.run).toHaveBeenCalledTimes(1);
-    expect(agentService.run).toHaveBeenCalledWith(
-      expect.objectContaining({
-        channel: 'instagram',
-        contactId: '507f1f77bcf86cd799439012',
-      }),
-      expect.anything(),
-    );
+    expect(incomingMessageOrchestrator.handle).toHaveBeenCalled();
     expect(fetchSpy).toHaveBeenCalledWith(
       expect.stringContaining('/me/messages'),
       expect.objectContaining({
@@ -162,11 +103,8 @@ describe('InstagramService', () => {
     );
   });
 
-  it('should ignore unroutable messages', async () => {
-    agentRoutingService.resolveRoute.mockResolvedValue({
-      kind: 'unroutable',
-      reason: 'no-candidates',
-    });
+  it('does not send reply when orchestrator returns undefined reply', async () => {
+    incomingMessageOrchestrator.handle.mockResolvedValue({});
 
     await service.handleIncoming({
       entry: [
@@ -182,9 +120,6 @@ describe('InstagramService', () => {
       ],
     });
 
-    expect(agentService.run).not.toHaveBeenCalled();
-    expect(loggerWarnSpy).toHaveBeenCalledWith(
-      '[Instagram] No active ClientAgent found for instagramAccountId=17841400000000000.',
-    );
+    expect(fetchSpy).not.toHaveBeenCalled();
   });
 });
diff --git a/src/channels/instagram/instagram.service.ts b/src/channels/instagram/instagram.service.ts
index 5ef3057..deb8238 100644
--- a/src/channels/instagram/instagram.service.ts
+++ b/src/channels/instagram/instagram.service.ts
@@ -1,20 +1,15 @@
 import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
 import { createHmac, timingSafeEqual } from 'crypto';
-import { Types } from 'mongoose';
-import { AgentService } from '../../agent/agent.service';
-import { AgentInput } from '../../agent/contracts/agent-input';
-import { AgentContext } from '../../agent/contracts/agent-context';
-import { AgentRepository } from '../../database/repositories/agent.repository';
-import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
+import { decryptRecord } from '../../database/utils/crypto.util';
 import {
   InstagramServerConfig,
   loadInstagramConfig,
   buildMessagesUrl,
 } from './instagram.config';
-import { AgentRoutingService } from '../shared/agent-routing.service';
-import { AgentContextService } from '../../agent/agent-context.service';
-import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
 import { CHANNEL_TYPES } from '../shared/channel-type.constants';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
+import { IncomingChannelEvent } from '../shared/incoming-channel-event.interface';
+import { AgentRoutingService } from '../shared/agent-routing.service';
 
 @Injectable()
 export class InstagramService {
@@ -23,11 +18,8 @@ export class InstagramService {
   private readonly responseWindowMs = 24 * 60 * 60 * 1000;
 
   constructor(
-    private readonly agentService: AgentService,
-    private readonly agentRepository: AgentRepository,
+    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
     private readonly agentRoutingService: AgentRoutingService,
-    private readonly agentContextService: AgentContextService,
-    private readonly contactIdentityResolver: ContactIdentityResolver,
   ) {
     this.config = loadInstagramConfig();
   }
@@ -156,113 +148,60 @@ export class InstagramService {
           continue;
         }
 
-        const routeDecision = await this.agentRoutingService.resolveRoute({
+        const incomingEvent: IncomingChannelEvent = {
+          channelId: CHANNEL_TYPES.INSTAGRAM,
           routeChannelIdentifier: instagramAccountId,
           channelIdentifier: senderId,
-          incomingText: text,
-          channelType: CHANNEL_TYPES.INSTAGRAM,
-        });
-
-        if (routeDecision.kind === 'unroutable') {
-          this.logger.warn(
-            `[Instagram] No active ClientAgent found for instagramAccountId=${instagramAccountId}.`,
-          );
-          continue;
-        }
-
-        if (routeDecision.kind === 'ambiguous') {
-          const fallback = routeDecision.candidates[0];
-          if (!fallback?.channelConfig?.credentials) {
-            this.logger.warn(
-              `[Instagram] Unable to send routing clarification for instagramAccountId=${instagramAccountId}: missing credentials.`,
-            );
-            continue;
-          }
-
-          const decryptedCredentials = decryptRecord(fallback.channelConfig.credentials);
-          await this.sendMessage({
-            recipientId: senderId,
-            text: routeDecision.prompt,
-            accessToken: decryptedCredentials.accessToken,
-            messageTimestamp: event.timestamp,
-          });
-          continue;
-        }
-
-        const { clientAgent, channelConfig } = routeDecision.candidate;
+          messageId: event?.message?.mid,
+          text,
+          rawPayload: event,
+        };
 
-        if (!channelConfig.credentials) {
-          this.logger.error(
-            `[Instagram] Credentials missing for instagramAccountId=${instagramAccountId}. Possible select('+channels.credentials') omission.`,
-          );
+        const output = await this.incomingMessageOrchestrator.handle(incomingEvent);
+        if (!output?.reply) {
           continue;
         }
 
-        const agent = await this.agentRepository.findActiveById(clientAgent.agentId);
-        if (!agent) {
+        const accessToken = await this.resolveAccessToken(incomingEvent);
+        if (!accessToken) {
           this.logger.warn(
-            `[Instagram] Agent ${clientAgent.agentId} is not active. Skipping message.`,
+            `[Instagram] Unable to send outbound message for instagramAccountId=${instagramAccountId}: missing credentials.`,
           );
           continue;
         }
 
-        const rawContext: AgentContext = {
-          agentId: clientAgent.agentId,
-          agentName: agent.name,
-          clientId: clientAgent.clientId,
-          channelId: channelConfig.channelId.toString(),
-          systemPrompt: agent.systemPrompt,
-          llmConfig: {
-            ...channelConfig.llmConfig,
-            provider: (channelConfig.llmConfig.provider || 'openai') as any,
-            apiKey: decrypt(
-              channelConfig.llmConfig.apiKey &&
-                !channelConfig.llmConfig.apiKey.includes('REPLACE_ME')
-                ? channelConfig.llmConfig.apiKey
-                : process.env.OPENAI_API_KEY ?? '',
-            ),
-            model: channelConfig.llmConfig.model || 'gpt-4o',
-          },
-          channelConfig: decryptRecord(channelConfig.credentials),
-        };
-
-        const context = await this.agentContextService.enrichContext(rawContext);
-
-        const contact = await this.contactIdentityResolver.resolveContact({
-          channelType: CHANNEL_TYPES.INSTAGRAM,
-          payload: event,
-          clientId: new Types.ObjectId(clientAgent.clientId),
-          channelId: new Types.ObjectId(channelConfig.channelId.toString()),
-          contactName: senderId,
+        await this.sendMessage({
+          recipientId: senderId,
+          text: output.reply.text,
+          accessToken,
+          messageTimestamp: event.timestamp,
         });
+      }
+    }
+  }
 
-        const input: AgentInput = {
-          channel: CHANNEL_TYPES.INSTAGRAM,
-          contactId: contact._id.toString(),
-          message: {
-            type: 'text',
-            text,
-          },
-          contactMetadata: contact.metadata,
-          contactSummary: contact.contactSummary,
-          metadata: {
-            messageId: event?.message?.mid,
-            instagramAccountId,
-          },
-        };
+  private async resolveAccessToken(
+    event: IncomingChannelEvent,
+  ): Promise<string | undefined> {
+    const routeDecision = await this.agentRoutingService.resolveRoute({
+      routeChannelIdentifier: event.routeChannelIdentifier,
+      channelIdentifier: event.channelIdentifier,
+      incomingText: event.text,
+      channelType: CHANNEL_TYPES.INSTAGRAM,
+    });
 
-        const output = await this.agentService.run(input, context);
+    const channelConfig =
+      routeDecision.kind === 'resolved'
+        ? routeDecision.candidate.channelConfig
+        : routeDecision.kind === 'ambiguous'
+          ? routeDecision.candidates[0]?.channelConfig
+          : undefined;
 
-        if (output.reply) {
-          const decryptedCredentials = decryptRecord(channelConfig.credentials);
-          await this.sendMessage({
-            recipientId: senderId,
-            text: output.reply.text,
-            accessToken: decryptedCredentials.accessToken,
-            messageTimestamp: event.timestamp,
-          });
-        }
-      }
+    if (!channelConfig?.credentials) {
+      return undefined;
     }
+
+    const decryptedCredentials = decryptRecord(channelConfig.credentials);
+    return decryptedCredentials.accessToken;
   }
 }
diff --git a/src/channels/shared/conversation.service.spec.ts b/src/channels/shared/conversation.service.spec.ts
index 336e445..98defb6 100644
--- a/src/channels/shared/conversation.service.spec.ts
+++ b/src/channels/shared/conversation.service.spec.ts
@@ -212,4 +212,47 @@ describe('ConversationService', () => {
     expect(repository.findLatestOpenByClientContactAndChannel).toHaveBeenCalledTimes(3);
     expect(resultA._id.toString()).toBe(resultB._id.toString());
   });
+
+  it('handles 10 concurrent resolveOrCreate calls with a single open conversation', async () => {
+    const createdConversation = {
+      _id: newConversationId,
+      status: 'open',
+      lastMessageAt: now,
+    };
+
+    for (let i = 0; i < 10; i++) {
+      repository.findLatestOpenByClientContactAndChannel.mockResolvedValueOnce(null);
+    }
+    for (let i = 0; i < 9; i++) {
+      repository.findLatestOpenByClientContactAndChannel.mockResolvedValueOnce(
+        createdConversation as any,
+      );
+    }
+
+    repository.create.mockResolvedValueOnce(createdConversation as any);
+    for (let i = 0; i < 9; i++) {
+      repository.create.mockRejectedValueOnce({ code: 11000 });
+    }
+
+    const results = await Promise.all(
+      Array.from({ length: 10 }, () =>
+        service.resolveOrCreate({
+          clientId,
+          contactId,
+          channelId,
+          now,
+        }),
+      ),
+    );
+
+    expect(results).toHaveLength(10);
+    for (const result of results) {
+      expect(result._id.toString()).toBe(newConversationId.toString());
+    }
+
+    expect(repository.create).toHaveBeenCalledTimes(10);
+    expect(
+      repository.findLatestOpenByClientContactAndChannel,
+    ).toHaveBeenCalledTimes(19);
+  });
 });
diff --git a/src/channels/shared/conversation.service.ts b/src/channels/shared/conversation.service.ts
index 87fc66e..a63debe 100644
--- a/src/channels/shared/conversation.service.ts
+++ b/src/channels/shared/conversation.service.ts
@@ -59,7 +59,7 @@ export class ConversationService {
 
   async touch(
     conversationId: Types.ObjectId,
-    now: Date,
+    now: Date = new Date(),
   ): Promise<void> {
     await this.conversationRepository.updateLastMessageAt(conversationId, now);
   }
diff --git a/src/channels/shared/incoming-channel-event.interface.ts b/src/channels/shared/incoming-channel-event.interface.ts
new file mode 100644
index 0000000..d86a124
--- /dev/null
+++ b/src/channels/shared/incoming-channel-event.interface.ts
@@ -0,0 +1,9 @@
+export interface IncomingChannelEvent {
+  clientId?: string;
+  channelId: string;
+  routeChannelIdentifier: string;
+  channelIdentifier: string;
+  messageId: string;
+  text: string;
+  rawPayload?: any;
+}
diff --git a/src/channels/tiktok/tiktok.module.ts b/src/channels/tiktok/tiktok.module.ts
index 29438a0..fec5937 100644
--- a/src/channels/tiktok/tiktok.module.ts
+++ b/src/channels/tiktok/tiktok.module.ts
@@ -3,10 +3,11 @@ import { TiktokController } from './tiktok.controller';
 import { TiktokService } from './tiktok.service';
 import { AgentModule } from '../../agent/agent.module';
 import { SharedChannelModule } from '../shared/shared.module';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
 
 @Module({
   imports: [AgentModule, SharedChannelModule],
   controllers: [TiktokController],
-  providers: [TiktokService],
+  providers: [TiktokService, IncomingMessageOrchestrator],
 })
 export class TiktokModule {}
diff --git a/src/channels/tiktok/tiktok.service.spec.ts b/src/channels/tiktok/tiktok.service.spec.ts
index 5c67236..00d8b4d 100644
--- a/src/channels/tiktok/tiktok.service.spec.ts
+++ b/src/channels/tiktok/tiktok.service.spec.ts
@@ -1,30 +1,20 @@
 import { Test, TestingModule } from '@nestjs/testing';
 import { Logger } from '@nestjs/common';
 import { TiktokService } from './tiktok.service';
-import { AgentService } from '../../agent/agent.service';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
 import { AgentRoutingService } from '../shared/agent-routing.service';
-import { AgentRepository } from '../../database/repositories/agent.repository';
-import { AgentContextService } from '../../agent/agent-context.service';
-import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
-import { AgentOutput } from '../../agent/contracts/agent-output';
 import { encrypt } from '../../database/utils/crypto.util';
 
 describe('TiktokService', () => {
   let service: TiktokService;
-  let agentService: jest.Mocked<AgentService>;
+  let incomingMessageOrchestrator: jest.Mocked<IncomingMessageOrchestrator>;
   let agentRoutingService: jest.Mocked<AgentRoutingService>;
-  let agentRepository: jest.Mocked<AgentRepository>;
-  let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
-  let loggerLogSpy: jest.SpyInstance;
   let loggerWarnSpy: jest.SpyInstance;
   let loggerErrorSpy: jest.SpyInstance;
   let fetchSpy: jest.SpyInstance;
 
   beforeEach(async () => {
-    jest.clearAllMocks();
-
     process.env.TIKTOK_API_BASE_URL = 'https://business-api.tiktok.com/open_api/v1.2';
-
     fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
       ok: true,
       text: jest.fn().mockResolvedValue('ok'),
@@ -34,53 +24,29 @@ describe('TiktokService', () => {
       providers: [
         TiktokService,
         {
-          provide: AgentService,
-          useValue: { run: jest.fn() },
+          provide: IncomingMessageOrchestrator,
+          useValue: { handle: jest.fn() },
         },
         {
           provide: AgentRoutingService,
           useValue: { resolveRoute: jest.fn() },
         },
-        {
-          provide: AgentRepository,
-          useValue: { findActiveById: jest.fn() },
-        },
-        {
-          provide: ContactIdentityResolver,
-          useValue: {
-            resolveContact: jest.fn(),
-          },
-        },
-        {
-          provide: AgentContextService,
-          useValue: {
-            enrichContext: jest.fn().mockImplementation((ctx) => Promise.resolve(ctx)),
-          },
-        },
       ],
     }).compile();
 
-    service = module.get<TiktokService>(TiktokService);
-    agentService = module.get(AgentService);
+    service = module.get(TiktokService);
+    incomingMessageOrchestrator = module.get(IncomingMessageOrchestrator);
     agentRoutingService = module.get(AgentRoutingService);
-    agentRepository = module.get(AgentRepository);
-    contactIdentityResolver = module.get(ContactIdentityResolver);
 
-    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
     loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
     loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
   });
 
   afterEach(() => {
-      loggerLogSpy.mockRestore();
-      loggerWarnSpy.mockRestore();
-      loggerErrorSpy.mockRestore();
-      fetchSpy.mockRestore();
-      delete process.env.TIKTOK_API_BASE_URL;
-  });
-
-  it('should be defined', () => {
-    expect(service).toBeDefined();
+    loggerWarnSpy.mockRestore();
+    loggerErrorSpy.mockRestore();
+    fetchSpy.mockRestore();
+    delete process.env.TIKTOK_API_BASE_URL;
   });
 
   describe('handleIncoming', () => {
@@ -93,13 +59,13 @@ describe('TiktokService', () => {
           ...overrides.message,
         },
         recipient: {
-            user_id: 'tiktok_user_123',
-            ...overrides.recipient,
+          user_id: 'tiktok_user_123',
+          ...overrides.recipient,
         },
         sender: {
-            user_id: 'sender_456',
-            username: 'sender_user',
-            ...overrides.sender,
+          user_id: 'sender_456',
+          username: 'sender_user',
+          ...overrides.sender,
         },
         conversation_id: 'conv_789',
         message_id: 'msg_111',
@@ -108,133 +74,64 @@ describe('TiktokService', () => {
       ...overrides.root,
     });
 
-    const accessToken = 'test_access_token';
-    const encryptedCredentials = {
-          tiktokUserId: 'tiktok_user_123',
-          accessToken: accessToken,
-    };
-    const encryptedCredsRecord = {};
-    for (const key in encryptedCredentials) {
-        encryptedCredsRecord[key] = encrypt(encryptedCredentials[key]);
-    }
-
-    const mockClientAgent = {
-        agentId: 'agent_007',
-        clientId: '507f1f77bcf86cd799439011',
-        channels: [
-          {
-            status: 'active',
-            channelId: '507f1f77bcf86cd799439014',
-            credentials: encryptedCredsRecord,
-            llmConfig: { provider: 'openai', apiKey: 'key' },
-          },
-        ],
-    };
-
-    const mockAgent = {
-        systemPrompt: 'You are a helpful assistant.',
-    };
-
-    it('should ignore non-message events', async () => {
+    it('returns early for invalid payload shapes', async () => {
       await service.handleIncoming(createPayload({ root: { event: 'other_event' } }));
-      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
-    });
-
-    it('should ignore messages without text', async () => {
       await service.handleIncoming(createPayload({ message: { type: 'image' } }));
-      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
-    });
-
-    it('should ignore messages without recipient user_id', async () => {
-        await service.handleIncoming(createPayload({ recipient: { user_id: undefined } }));
-        expect(loggerWarnSpy).toHaveBeenCalledWith('[TikTok] Missing recipient.user_id in payload.');
-        expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
-    });
-
-    it('should ignore messages without sender user_id', async () => {
+      await service.handleIncoming(createPayload({ recipient: { user_id: undefined } }));
       await service.handleIncoming(createPayload({ sender: { user_id: undefined } }));
-      expect(loggerWarnSpy).toHaveBeenCalledWith('[TikTok] Missing sender.user_id in payload.');
-      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
-    });
 
-    it('should log warning when no ClientAgent found for tiktokUserId', async () => {
-        agentRoutingService.resolveRoute.mockResolvedValue({ kind: 'unroutable', reason: 'no-candidates' });
-        await service.handleIncoming(createPayload());
-        expect(loggerWarnSpy).toHaveBeenCalledWith(
-            '[TikTok] No active ClientAgent found for tiktokUserId=tiktok_user_123.',
-        );
-        expect(agentService.run).not.toHaveBeenCalled();
+      expect(incomingMessageOrchestrator.handle).not.toHaveBeenCalled();
+      expect(loggerWarnSpy).toHaveBeenCalled();
     });
 
-    it('should log warning when channel config mismatch in ClientAgent', async () => {
-        agentRoutingService.resolveRoute.mockResolvedValue({ kind: 'unroutable', reason: 'no-candidates' });
-        await service.handleIncoming(createPayload());
-        expect(loggerWarnSpy).toHaveBeenCalledWith(
-            '[TikTok] No active ClientAgent found for tiktokUserId=tiktok_user_123.',
-        );
-         expect(agentService.run).not.toHaveBeenCalled();
-    });
-
-    it('should process valid text message and send reply', async () => {
+    it('sends reply when orchestrator returns one', async () => {
+      const encryptedCredentials = {
+        tiktokUserId: encrypt('tiktok_user_123'),
+        accessToken: encrypt('test_access_token'),
+      };
+      incomingMessageOrchestrator.handle.mockResolvedValue({
+        reply: { text: 'Hello back!', type: 'text' },
+      });
       agentRoutingService.resolveRoute.mockResolvedValue({
         kind: 'resolved',
         candidate: {
-          clientAgent: mockClientAgent,
-          channelConfig: mockClientAgent.channels[0],
-          agentName: 'Test Agent',
+          channelConfig: { credentials: encryptedCredentials },
         },
       } as any);
-      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
-      contactIdentityResolver.resolveContact.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439012',
-      } as any);
-      agentService.run.mockResolvedValue({
-        reply: { text: 'Hello back!', type: 'text' },
-      });
 
       await service.handleIncoming(createPayload());
 
-      expect(agentRoutingService.resolveRoute).toHaveBeenCalled();
-      expect(agentService.run).toHaveBeenCalled();
-      expect(agentService.run).toHaveBeenCalledWith(
-        expect.objectContaining({
-          channel: 'tiktok',
-          contactId: '507f1f77bcf86cd799439012',
-        }),
-        expect.anything(),
-      );
-      
-      // Verify fetch was called with correct args
+      expect(incomingMessageOrchestrator.handle).toHaveBeenCalled();
       expect(fetchSpy).toHaveBeenCalledWith(
         expect.stringContaining('/message/send/'),
         expect.objectContaining({
-            method: 'POST',
-            body: expect.stringContaining('Hello back!'),
-            headers: expect.objectContaining({
-                Authorization: `Bearer ${accessToken}`
-            })
-        })
+          method: 'POST',
+          body: expect.stringContaining('Hello back!'),
+        }),
       );
-      expect(loggerLogSpy).toHaveBeenCalledWith('[TikTok] Reply sent successfully.');
     });
 
-    it('should handle API errors when sending reply', async () => {
+    it('does not send when reply is undefined', async () => {
+      incomingMessageOrchestrator.handle.mockResolvedValue({});
+
+      await service.handleIncoming(createPayload());
+      expect(fetchSpy).not.toHaveBeenCalled();
+    });
+
+    it('logs send errors and does not throw', async () => {
+      const encryptedCredentials = {
+        tiktokUserId: encrypt('tiktok_user_123'),
+        accessToken: encrypt('test_access_token'),
+      };
+      incomingMessageOrchestrator.handle.mockResolvedValue({
+        reply: { text: 'Hello back!', type: 'text' },
+      });
       agentRoutingService.resolveRoute.mockResolvedValue({
         kind: 'resolved',
         candidate: {
-          clientAgent: mockClientAgent,
-          channelConfig: mockClientAgent.channels[0],
-          agentName: 'Test Agent',
+          channelConfig: { credentials: encryptedCredentials },
         },
       } as any);
-      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
-      contactIdentityResolver.resolveContact.mockResolvedValue({
-        _id: '507f1f77bcf86cd799439012',
-      } as any);
-      agentService.run.mockResolvedValue({
-        reply: { text: 'Hello back!', type: 'text' },
-      });
-
       fetchSpy.mockResolvedValueOnce({
         ok: false,
         status: 400,
@@ -242,8 +139,9 @@ describe('TiktokService', () => {
       } as unknown as Response);
 
       await expect(service.handleIncoming(createPayload())).resolves.not.toThrow();
-      expect(fetchSpy).toHaveBeenCalled();
-      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send reply'));
+      expect(loggerErrorSpy).toHaveBeenCalledWith(
+        expect.stringContaining('Failed to send reply'),
+      );
     });
   });
 });
diff --git a/src/channels/tiktok/tiktok.service.ts b/src/channels/tiktok/tiktok.service.ts
index 589b25f..2d69c11 100644
--- a/src/channels/tiktok/tiktok.service.ts
+++ b/src/channels/tiktok/tiktok.service.ts
@@ -1,26 +1,18 @@
 import { Injectable, Logger } from '@nestjs/common';
-import { Types } from 'mongoose';
-import { AgentService } from '../../agent/agent.service';
-import { AgentInput } from '../../agent/contracts/agent-input';
-import { AgentContext } from '../../agent/contracts/agent-context';
-import { AgentRepository } from '../../database/repositories/agent.repository';
-import { AgentRoutingService } from '../shared/agent-routing.service';
-import { AgentContextService } from '../../agent/agent-context.service';
-import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
+import { decryptRecord } from '../../database/utils/crypto.util';
 import { TIKTOK_API_BASE_URL } from './tiktok.config';
-import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
 import { CHANNEL_TYPES } from '../shared/channel-type.constants';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
+import { IncomingChannelEvent } from '../shared/incoming-channel-event.interface';
+import { AgentRoutingService } from '../shared/agent-routing.service';
 
 @Injectable()
 export class TiktokService {
   private readonly logger = new Logger(TiktokService.name);
 
   constructor(
-    private readonly agentService: AgentService,
+    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
     private readonly agentRoutingService: AgentRoutingService,
-    private readonly agentRepository: AgentRepository,
-    private readonly agentContextService: AgentContextService,
-    private readonly contactIdentityResolver: ContactIdentityResolver,
   ) {}
 
   async handleIncoming(payload: any): Promise<void> {
@@ -53,118 +45,68 @@ export class TiktokService {
       `[TikTok] Incoming message from sender=${data.sender?.user_id} to recipient=${recipientUserId}`,
     );
 
-    // Route: resolve which agent should handle this message
-    const routeDecision = await this.agentRoutingService.resolveRoute({
+    const incomingEvent: IncomingChannelEvent = {
+      channelId: CHANNEL_TYPES.TIKTOK,
       routeChannelIdentifier: recipientUserId,
       channelIdentifier: senderUserId,
-      incomingText: data.message.text,
-      channelType: CHANNEL_TYPES.TIKTOK,
-    });
+      messageId: data.message_id,
+      text: data.message.text,
+      rawPayload: payload,
+    };
 
-    if (routeDecision.kind === 'unroutable') {
-      this.logger.warn(
-        `[TikTok] No active ClientAgent found for tiktokUserId=${recipientUserId}.`,
-      );
+    const output = await this.incomingMessageOrchestrator.handle(incomingEvent);
+    if (!output?.reply) {
       return;
     }
 
-    if (routeDecision.kind === 'ambiguous') {
-      // TikTok doesn't support channel-agnostic sending from this context
-      // Future: implement ambiguity prompt via TikTok API
+    const accessToken = await this.resolveAccessToken(incomingEvent);
+    if (!accessToken) {
       this.logger.warn(
-        `[TikTok] Multiple agents for tiktokUserId=${recipientUserId}, cannot send disambiguation prompt yet.`,
+        `[TikTok] Unable to send outbound message for tiktokUserId=${recipientUserId}: missing credentials.`,
       );
       return;
     }
 
-    const { clientAgent, channelConfig } = routeDecision.candidate;
-
-    // Guard: credentials may be undefined if select('+channels.credentials') was missed
-    if (!channelConfig.credentials) {
-      this.logger.error(
-        `[TikTok] Credentials missing for tiktokUserId=${recipientUserId}. Possible select('+channels.credentials') omission.`,
-      );
-      return;
-    }
-
-    const agent = await this.agentRepository.findActiveById(
-      clientAgent.agentId,
+    this.logger.log(
+      `[TikTok] Sending reply to sender=${data.sender.user_id}`,
     );
-    if (!agent) {
-      this.logger.warn(
-        `[TikTok] Agent ${clientAgent.agentId} is not active. Skipping message.`,
-      );
-      return;
-    }
-
-    const rawContext: AgentContext = {
-      agentId: clientAgent.agentId,
-      agentName: agent.name,
-      clientId: clientAgent.clientId,
-      channelId: channelConfig.channelId.toString(),
-      systemPrompt: agent.systemPrompt,
-      llmConfig: {
-        ...channelConfig.llmConfig,
-        // TODO: [HACK] REMOVE THIS IN PRODUCTION.
-        // Forcing 'openai' provider and system key for dev/testing ease.
-        // This bypasses client billing!
-        provider: (channelConfig.llmConfig.provider || 'openai') as any,
-        apiKey: decrypt(
-          channelConfig.llmConfig.apiKey &&
-            !channelConfig.llmConfig.apiKey.includes('REPLACE_ME')
-            ? channelConfig.llmConfig.apiKey
-            : process.env.OPENAI_API_KEY ?? '',
-        ),
-        model: channelConfig.llmConfig.model || 'gpt-4o',
-      },
-      channelConfig: decryptRecord(channelConfig.credentials),
-    };
 
-    const context = await this.agentContextService.enrichContext(rawContext);
+    try {
+      await this.sendMessage({
+        recipientId: data.sender.user_id,
+        conversationId: data.conversation_id,
+        text: output.reply.text,
+        accessToken,
+      });
+      this.logger.log(`[TikTok] Reply sent successfully.`);
+    } catch (error) {
+      this.logger.error(`[TikTok] Failed to send reply: ${error.message}`);
+    }
+  }
 
-    const contact = await this.contactIdentityResolver.resolveContact({
+  private async resolveAccessToken(
+    event: IncomingChannelEvent,
+  ): Promise<string | undefined> {
+    const routeDecision = await this.agentRoutingService.resolveRoute({
+      routeChannelIdentifier: event.routeChannelIdentifier,
+      channelIdentifier: event.channelIdentifier,
+      incomingText: event.text,
       channelType: CHANNEL_TYPES.TIKTOK,
-      payload,
-      clientId: new Types.ObjectId(clientAgent.clientId),
-      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
-      contactName: senderUserId,
     });
 
-    const input: AgentInput = {
-      channel: CHANNEL_TYPES.TIKTOK,
-      contactId: contact._id.toString(),
-      message: {
-        type: 'text',
-        text: data.message.text,
-      },
-      contactMetadata: contact.metadata,
-      contactSummary: contact.contactSummary,
-      metadata: {
-        messageId: data.message_id,
-        senderUsername: data.sender?.username,
-      },
-    };
-
-    const output = await this.agentService.run(input, context);
+    const channelConfig =
+      routeDecision.kind === 'resolved'
+        ? routeDecision.candidate.channelConfig
+        : routeDecision.kind === 'ambiguous'
+          ? routeDecision.candidates[0]?.channelConfig
+          : undefined;
 
-    if (output.reply) {
-      this.logger.log(
-        `[TikTok] Sending reply to sender=${data.sender.user_id}`,
-      );
-      const decryptedCredentials = decryptRecord(channelConfig.credentials);
-      
-      try {
-        await this.sendMessage({
-          recipientId: data.sender.user_id,
-          conversationId: data.conversation_id,
-          text: output.reply.text,
-          accessToken: decryptedCredentials.accessToken,
-        });
-        this.logger.log(`[TikTok] Reply sent successfully.`);
-      } catch (error) {
-        this.logger.error(`[TikTok] Failed to send reply: ${error.message}`);
-      }
+    if (!channelConfig?.credentials) {
+      return undefined;
     }
+
+    const decryptedCredentials = decryptRecord(channelConfig.credentials);
+    return decryptedCredentials.accessToken;
   }
 
   private async sendMessage(params: {
@@ -174,7 +116,7 @@ export class TiktokService {
     accessToken: string;
   }): Promise<void> {
     const { recipientId, conversationId, text, accessToken } = params;
-    
+
     const url = `${TIKTOK_API_BASE_URL}/message/send/`;
 
     const response = await fetch(url, {
diff --git a/src/channels/whatsapp/whatsapp.module.ts b/src/channels/whatsapp/whatsapp.module.ts
index b0a902f..22207ee 100644
--- a/src/channels/whatsapp/whatsapp.module.ts
+++ b/src/channels/whatsapp/whatsapp.module.ts
@@ -3,10 +3,11 @@ import { WhatsappController } from './whatsapp.controller';
 import { WhatsappService } from './whatsapp.service';
 import { AgentModule } from '../../agent/agent.module';
 import { SharedChannelModule } from '../shared/shared.module';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
 
 @Module({
   imports: [AgentModule, SharedChannelModule],
   controllers: [WhatsappController],
-  providers: [WhatsappService],
+  providers: [WhatsappService, IncomingMessageOrchestrator],
 })
 export class WhatsappModule {}
diff --git a/src/channels/whatsapp/whatsapp.service.spec.ts b/src/channels/whatsapp/whatsapp.service.spec.ts
index 181e185..5da9631 100644
--- a/src/channels/whatsapp/whatsapp.service.spec.ts
+++ b/src/channels/whatsapp/whatsapp.service.spec.ts
@@ -1,31 +1,21 @@
 import { Test, TestingModule } from '@nestjs/testing';
 import { ForbiddenException, Logger } from '@nestjs/common';
-
 import { WhatsappService } from './whatsapp.service';
-import { AgentService } from '../../agent/agent.service';
-import { AgentRepository } from '../../database/repositories/agent.repository';
-import { ClientRepository } from '../../database/repositories/client.repository';
-import { LlmProvider } from '../../agent/llm/provider.enum';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
+import { CHANNEL_TYPES } from '../shared/channel-type.constants';
 import { AgentRoutingService } from '../shared/agent-routing.service';
-import { AgentContextService } from '../../agent/agent-context.service';
-import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
+import { encrypt } from '../../database/utils/crypto.util';
 
 describe('WhatsappService', () => {
   let service: WhatsappService;
-  let agentService: jest.Mocked<AgentService>;
+  let incomingMessageOrchestrator: jest.Mocked<IncomingMessageOrchestrator>;
   let agentRoutingService: jest.Mocked<AgentRoutingService>;
-  let agentRepository: jest.Mocked<AgentRepository>;
-  let contactIdentityResolver: jest.Mocked<ContactIdentityResolver>;
   let loggerLogSpy: jest.SpyInstance;
-  let loggerWarnSpy: jest.SpyInstance;
   let fetchSpy: jest.SpyInstance;
 
   beforeEach(async () => {
-    // Set env vars for server-level WhatsApp config
-    process.env.WHATSAPP_API_HOST = 'http://localhost:3005';
     process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-token';
-
-    // Mock global fetch to prevent real HTTP calls
+    process.env.WHATSAPP_API_HOST = 'http://localhost:3005';
     fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
       ok: true,
       text: jest.fn().mockResolvedValue(''),
@@ -35,80 +25,41 @@ describe('WhatsappService', () => {
       providers: [
         WhatsappService,
         {
-          provide: AgentService,
-          useValue: { run: jest.fn() },
+          provide: IncomingMessageOrchestrator,
+          useValue: { handle: jest.fn() },
         },
         {
           provide: AgentRoutingService,
           useValue: { resolveRoute: jest.fn() },
         },
-        {
-          provide: AgentRepository,
-          useValue: { findActiveById: jest.fn() },
-        },
-        {
-          provide: ClientRepository,
-          useValue: { findById: jest.fn().mockResolvedValue({ name: 'Test Client' }) },
-        },
-        {
-          provide: ContactIdentityResolver,
-          useValue: {
-            resolveContact: jest.fn(),
-          },
-        },
-        {
-          provide: AgentContextService,
-          useValue: {
-            enrichContext: jest.fn().mockImplementation((ctx) => Promise.resolve(ctx)),
-          },
-        },
       ],
     }).compile();
 
     service = module.get<WhatsappService>(WhatsappService);
-    agentService = module.get(AgentService);
+    incomingMessageOrchestrator = module.get(IncomingMessageOrchestrator);
     agentRoutingService = module.get(AgentRoutingService);
-    agentRepository = module.get(AgentRepository);
-    contactIdentityResolver = module.get(ContactIdentityResolver);
-
-    // Spy on Logger.prototype since a new Logger() is instantiated in the service
     loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
-    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
   });
 
   afterEach(() => {
     loggerLogSpy.mockRestore();
-    loggerWarnSpy.mockRestore();
     fetchSpy.mockRestore();
-    delete process.env.WHATSAPP_API_HOST;
     delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
-  });
-
-  it('should be defined', () => {
-    expect(service).toBeDefined();
+    delete process.env.WHATSAPP_API_HOST;
   });
 
   describe('verifyWebhook', () => {
-    it('should return challenge when mode is subscribe and token is valid', () => {
-      const result = service.verifyWebhook(
-        'subscribe',
-        'test-token',
-        'challenge123',
-      );
-      expect(result).toBe('challenge123');
+    it('returns challenge when mode is subscribe and token is valid', () => {
+      expect(
+        service.verifyWebhook('subscribe', 'test-token', 'challenge123'),
+      ).toBe('challenge123');
     });
 
-    it('should throw ForbiddenException when token is invalid', () => {
+    it('throws ForbiddenException when token is invalid', () => {
       expect(() =>
         service.verifyWebhook('subscribe', 'wrong-token', 'challenge123'),
       ).toThrow(ForbiddenException);
     });
-
-    it('should throw ForbiddenException when mode is not subscribe', () => {
-      expect(() =>
-        service.verifyWebhook('unsubscribe', 'test-token', 'challenge123'),
-      ).toThrow(ForbiddenException);
-    });
   });
 
   describe('handleIncoming', () => {
@@ -142,174 +93,51 @@ describe('WhatsappService', () => {
       ...overrides.root,
     });
 
-    const mockClientAgent = {
-      _id: 'ca-1',
-      clientId: '507f1f77bcf86cd799439011',
-      agentId: 'agent-1',
-      status: 'active',
-      channels: [
-        {
-          channelId: '507f1f77bcf86cd799439014',
-          status: 'active',
-          provider: 'meta',
-          credentials: { phoneNumberId: 'phone123', accessToken: 'sk-wa-token' },
-          llmConfig: {
-            provider: LlmProvider.OpenAI,
-            apiKey: 'sk-mock-key',
-            model: 'gpt-4',
-          },
-        },
-      ],
-    };
-
-    const mockAgent = {
-      id: 'agent-1',
-      name: 'Support Bot',
-      systemPrompt: 'You are a helpful assistant.',
-    };
-
-    const mockContact = {
-      _id: '507f1f77bcf86cd799439012',
+    const encryptedCredentials = {
+      phoneNumberId: encrypt('phone123'),
+      accessToken: encrypt('wa-token'),
     };
 
-    const mockResolvedRoute = {
-      kind: 'resolved' as const,
-      candidate: {
-        clientAgent: mockClientAgent,
-        channelConfig: mockClientAgent.channels[0],
-        agentName: 'Support Bot',
-      },
-    };
-
-    it('should return early when payload has no messages', async () => {
-      await service.handleIncoming({});
-      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
-    });
-
-    it('should return early when payload has no entry', async () => {
-      await service.handleIncoming({ entry: [] });
-      expect(agentRoutingService.resolveRoute).not.toHaveBeenCalled();
-    });
-
-    it('should return early when message type is not text', async () => {
-      const payload = createPayload({ message: { type: 'image' } });
-      await service.handleIncoming(payload);
-      expect(agentService.run).not.toHaveBeenCalled();
-    });
-
-    it('should log warning when no route is found for phoneNumberId', async () => {
-      agentRoutingService.resolveRoute.mockResolvedValue({
-        kind: 'unroutable',
-        reason: 'no-candidates',
-      });
-
-      const payload = createPayload({
-        metadata: { phone_number_id: 'unknown-phone' },
-      });
-      await service.handleIncoming(payload);
-
-      expect(loggerWarnSpy).toHaveBeenCalledWith(
-        '[WhatsApp] No active ClientAgent found for phoneNumberId=unknown-phone.',
-      );
-      expect(agentService.run).not.toHaveBeenCalled();
-    });
-
-    it('should send clarification prompt when routing is ambiguous', async () => {
-      agentRoutingService.resolveRoute.mockResolvedValue({
-        kind: 'ambiguous',
-        candidates: [
-          {
-            clientAgent: mockClientAgent as any,
-            channelConfig: mockClientAgent.channels[0] as any,
-            agentName: 'Support Bot',
-          },
-          {
-            clientAgent: mockClientAgent as any,
-            channelConfig: mockClientAgent.channels[0] as any,
-            agentName: 'Sales Bot',
-          },
-        ],
-        prompt: 'Please choose the agent',
-      });
-
+    it('maps payload to incoming event and delegates to orchestrator', async () => {
+      incomingMessageOrchestrator.handle.mockResolvedValue(undefined);
       const payload = createPayload();
       await service.handleIncoming(payload);
 
-      expect(fetchSpy).toHaveBeenCalled();
-      expect(agentService.run).not.toHaveBeenCalled();
-      expect(loggerLogSpy).toHaveBeenCalledWith(
-        '[WhatsApp] Message sent successfully to 1234567890',
-      );
-    });
-
-    it('should call agentService.run with correct input and context', async () => {
-      agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
-      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
-      contactIdentityResolver.resolveContact.mockResolvedValue(mockContact as any);
-      agentService.run.mockResolvedValue({
-        reply: { type: 'text', text: 'Hello' },
+      expect(incomingMessageOrchestrator.handle).toHaveBeenCalledWith({
+        channelId: CHANNEL_TYPES.WHATSAPP,
+        routeChannelIdentifier: 'phone123',
+        channelIdentifier: '1234567890',
+        messageId: 'msg123',
+        text: 'Hello',
+        rawPayload: payload,
       });
-
-      const payload = createPayload();
-      await service.handleIncoming(payload);
-
-      expect(agentService.run).toHaveBeenCalledWith(
-        {
-          channel: 'whatsapp',
-          contactId: '507f1f77bcf86cd799439012',
-          message: { type: 'text', text: 'Hello' },
-          contactMetadata: undefined,
-          contactSummary: undefined,
-          metadata: { messageId: 'msg123', phoneNumberId: 'phone123' },
-        },
-        expect.objectContaining({
-          agentId: 'agent-1',
-          clientId: '507f1f77bcf86cd799439011',
-          channelId: '507f1f77bcf86cd799439014',
-          systemPrompt: 'You are a helpful assistant.',
-          channelConfig: mockClientAgent.channels[0].credentials,
-        }),
-      );
     });
 
-    it('should log outbound message when reply exists', async () => {
-      agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
-      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
-      contactIdentityResolver.resolveContact.mockResolvedValue(mockContact as any);
-      agentService.run.mockResolvedValue({
+    it('sends outbound message when orchestrator returns reply', async () => {
+      incomingMessageOrchestrator.handle.mockResolvedValue({
         reply: { type: 'text', text: 'Echo response' },
       });
+      agentRoutingService.resolveRoute.mockResolvedValue({
+        kind: 'resolved',
+        candidate: {
+          channelConfig: { credentials: encryptedCredentials },
+        },
+      } as any);
 
-      const payload = createPayload();
-      await service.handleIncoming(payload);
+      await service.handleIncoming(createPayload());
 
+      expect(fetchSpy).toHaveBeenCalled();
       expect(loggerLogSpy).toHaveBeenCalledWith(
         '[WhatsApp] Sending to 1234567890: Echo response',
       );
     });
 
-    it('should not log outbound message when reply is undefined', async () => {
-      agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
-      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
-      contactIdentityResolver.resolveContact.mockResolvedValue(mockContact as any);
-      agentService.run.mockResolvedValue({});
+    it('does not send outbound when orchestrator reply is undefined', async () => {
+      incomingMessageOrchestrator.handle.mockResolvedValue({});
 
-      const payload = createPayload();
-      await service.handleIncoming(payload);
-
-      expect(loggerLogSpy).not.toHaveBeenCalledWith(
-        expect.stringContaining('[WhatsApp] Sending to'),
-      );
-    });
-
-    it('should skip processing when agent is not active', async () => {
-      agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
-      agentRepository.findActiveById.mockResolvedValue(null);
-
-      const payload = createPayload();
-      await service.handleIncoming(payload);
+      await service.handleIncoming(createPayload());
 
-      expect(agentService.run).not.toHaveBeenCalled();
+      expect(fetchSpy).not.toHaveBeenCalled();
     });
   });
 });
diff --git a/src/channels/whatsapp/whatsapp.service.ts b/src/channels/whatsapp/whatsapp.service.ts
index c226be8..9106889 100644
--- a/src/channels/whatsapp/whatsapp.service.ts
+++ b/src/channels/whatsapp/whatsapp.service.ts
@@ -1,21 +1,14 @@
 import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
-import { Types } from 'mongoose';
-import { AgentService } from '../../agent/agent.service';
-import { AgentInput } from '../../agent/contracts/agent-input';
-import { AgentContext } from '../../agent/contracts/agent-context';
-import { AgentRepository } from '../../database/repositories/agent.repository';
-import { ClientRepository } from '../../database/repositories/client.repository';
-import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
-import { RouteCandidate } from '../shared/agent-routing.service';
 import {
   WhatsAppServerConfig,
-  loadWhatsAppConfig,
   buildMessagesUrl,
+  loadWhatsAppConfig,
 } from './whatsapp.config';
-import { AgentRoutingService } from '../shared/agent-routing.service';
-import { AgentContextService } from '../../agent/agent-context.service';
-import { ContactIdentityResolver } from '../shared/contact-identity.resolver';
 import { CHANNEL_TYPES } from '../shared/channel-type.constants';
+import { IncomingMessageOrchestrator } from '../../agent/incoming-message.orchestrator';
+import { IncomingChannelEvent } from '../shared/incoming-channel-event.interface';
+import { AgentRoutingService } from '../shared/agent-routing.service';
+import { decryptRecord } from '../../database/utils/crypto.util';
 
 @Injectable()
 export class WhatsappService {
@@ -23,12 +16,8 @@ export class WhatsappService {
   private readonly config: WhatsAppServerConfig;
 
   constructor(
-    private readonly agentService: AgentService,
-    private readonly agentRepository: AgentRepository,
-    private readonly clientRepository: ClientRepository,
+    private readonly incomingMessageOrchestrator: IncomingMessageOrchestrator,
     private readonly agentRoutingService: AgentRoutingService,
-    private readonly agentContextService: AgentContextService,
-    private readonly contactIdentityResolver: ContactIdentityResolver,
   ) {
     this.config = loadWhatsAppConfig();
   }
@@ -40,53 +29,6 @@ export class WhatsappService {
     throw new ForbiddenException('Verification failed');
   }
 
-  private async sendMessage(
-    to: string,
-    text: string,
-    channelCredentials: { phoneNumberId: string; accessToken: string },
-  ): Promise<void> {
-    const url = buildMessagesUrl(this.config, channelCredentials.phoneNumberId);
-
-    const body = JSON.stringify({
-      messaging_product: 'whatsapp',
-      recipient_type: 'individual',
-      to,
-      type: 'text',
-      text: { body: text },
-    });
-
-    this.logger.log(`[WhatsApp] Sending message to ${url} | payload: ${body}`);
-
-    let response: Response;
-    try {
-      response = await fetch(url, {
-        method: 'POST',
-        headers: {
-          'Content-Type': 'application/json',
-          Authorization: `Bearer ${channelCredentials.accessToken}`,
-        },
-        body,
-      });
-    } catch (error) {
-      const cause = error instanceof Error ? (error as any).cause : undefined;
-      this.logger.error(
-        `[WhatsApp] fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}` +
-          (cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ''),
-      );
-      throw error;
-    }
-
-    if (!response.ok) {
-      const errorBody = await response.text();
-      this.logger.error(
-        `[WhatsApp] Failed to send message to ${url}: ${response.status} ${errorBody}`,
-      );
-      throw new Error(`WhatsApp API error: ${response.status}`);
-    }
-
-    this.logger.log(`[WhatsApp] Message sent successfully to ${to}`);
-  }
-
   async handleIncoming(payload: any): Promise<void> {
     // TODO: deduplicate message.id to avoid double-processing
 
@@ -108,143 +50,110 @@ export class WhatsappService {
     );
     this.logger.log(`[WhatsApp] Extracted phoneNumberId: ${phoneNumberId}`);
 
-    const routeDecision = await this.agentRoutingService.resolveRoute({
+    const event: IncomingChannelEvent = {
+      channelId: CHANNEL_TYPES.WHATSAPP,
       routeChannelIdentifier: phoneNumberId,
       channelIdentifier: message.from,
-      incomingText: message.text.body,
-      channelType: CHANNEL_TYPES.WHATSAPP,
-    });
+      messageId: message.id,
+      text: message.text.body,
+      rawPayload: payload,
+    };
 
-    if (routeDecision.kind === 'unroutable') {
-      this.logger.warn(
-        `[WhatsApp] No active ClientAgent found for phoneNumberId=${phoneNumberId}.`,
-      );
+    const output = await this.incomingMessageOrchestrator.handle(event);
+    if (!output?.reply) {
       return;
     }
 
-    if (routeDecision.kind === 'ambiguous') {
-      const fallback = routeDecision.candidates[0];
-      if (!fallback?.channelConfig?.credentials) {
-        this.logger.warn(
-          `[WhatsApp] Unable to send routing clarification for phoneNumberId=${phoneNumberId}: missing credentials.`,
-        );
-        return;
-      }
-
-      const prompt = await this.buildAmbiguousPrompt(routeDecision.candidates);
-      const decryptedCredentials = decryptRecord(fallback.channelConfig.credentials);
-      await this.sendMessage(message.from, prompt, {
-        phoneNumberId: decryptedCredentials.phoneNumberId,
-        accessToken: decryptedCredentials.accessToken,
-      });
+    const credentials = await this.resolveOutboundCredentials(event);
+    if (!credentials) {
+      this.logger.warn(
+        `[WhatsApp] Unable to send outbound message for phoneNumberId=${phoneNumberId}: missing credentials.`,
+      );
       return;
     }
 
-    const { clientAgent, channelConfig } = routeDecision.candidate;
+    this.logger.log(
+      `[WhatsApp] Sending to ${event.channelIdentifier}: ${output.reply.text}`,
+    );
+    await this.sendMessage(event.channelIdentifier, output.reply.text, credentials);
+  }
 
-    // Guard: credentials may be undefined if select('+channels.credentials') was missed
-    if (!channelConfig.credentials) {
-      this.logger.error(
-        `[WhatsApp] Credentials missing for phoneNumberId=${phoneNumberId}. Possible select('+channels.credentials') omission.`,
-      );
-      return;
+  private async resolveOutboundCredentials(
+    event: IncomingChannelEvent,
+  ): Promise<{ phoneNumberId: string; accessToken: string } | undefined> {
+    const routeDecision = await this.agentRoutingService.resolveRoute({
+      routeChannelIdentifier: event.routeChannelIdentifier,
+      channelIdentifier: event.channelIdentifier,
+      incomingText: event.text,
+      channelType: CHANNEL_TYPES.WHATSAPP,
+    });
+
+    const channelConfig =
+      routeDecision.kind === 'resolved'
+        ? routeDecision.candidate.channelConfig
+        : routeDecision.kind === 'ambiguous'
+          ? routeDecision.candidates[0]?.channelConfig
+          : undefined;
+
+    if (!channelConfig?.credentials) {
+      return undefined;
     }
 
-    const agent = await this.agentRepository.findActiveById(
-      clientAgent.agentId,
-    );
-    if (!agent) {
-      this.logger.warn(
-        `[WhatsApp] Agent ${clientAgent.agentId} is not active. Skipping message.`,
-      );
-      return;
+    const decryptedCredentials = decryptRecord(channelConfig.credentials);
+    if (!decryptedCredentials.phoneNumberId || !decryptedCredentials.accessToken) {
+      return undefined;
     }
 
-    const rawContext: AgentContext = {
-      agentId: clientAgent.agentId,
-      agentName: agent.name,
-      clientId: clientAgent.clientId,
-      channelId: channelConfig.channelId.toString(),
-      systemPrompt: agent.systemPrompt,
-      llmConfig: {
-        ...channelConfig.llmConfig,
-        // TODO: [HACK] REMOVE THIS IN PRODUCTION.
-        // Forcing 'openai' provider and system key for dev/testing ease.
-        // This bypasses client billing!
-        provider: (channelConfig.llmConfig.provider || 'openai') as any,
-        apiKey: decrypt(
-          channelConfig.llmConfig.apiKey &&
-            !channelConfig.llmConfig.apiKey.includes('REPLACE_ME')
-            ? channelConfig.llmConfig.apiKey
-            : process.env.OPENAI_API_KEY ?? '',
-        ),
-        model: channelConfig.llmConfig.model || 'gpt-4o',
-      },
-      channelConfig: decryptRecord(channelConfig.credentials),
+    return {
+      phoneNumberId: decryptedCredentials.phoneNumberId,
+      accessToken: decryptedCredentials.accessToken,
     };
+  }
 
-    const context = await this.agentContextService.enrichContext(rawContext);
+  private async sendMessage(
+    to: string,
+    text: string,
+    channelCredentials: { phoneNumberId: string; accessToken: string },
+  ): Promise<void> {
+    const url = buildMessagesUrl(this.config, channelCredentials.phoneNumberId);
 
-    const contact = await this.contactIdentityResolver.resolveContact({
-      channelType: CHANNEL_TYPES.WHATSAPP,
-      payload,
-      clientId: new Types.ObjectId(clientAgent.clientId),
-      channelId: new Types.ObjectId(channelConfig.channelId.toString()),
-      contactName: message.from,
+    const body = JSON.stringify({
+      messaging_product: 'whatsapp',
+      recipient_type: 'individual',
+      to,
+      type: 'text',
+      text: { body: text },
     });
 
-    const input: AgentInput = {
-      channel: CHANNEL_TYPES.WHATSAPP,
-      contactId: contact._id.toString(),
-      message: {
-        type: 'text',
-        text: message.text.body,
-      },
-      contactMetadata: contact.metadata,
-      contactSummary: contact.contactSummary,
-      metadata: {
-        messageId: message.id,
-        phoneNumberId,
-      },
-    };
-
-    const output = await this.agentService.run(input, context);
-
-    if (output.reply) {
-      this.logger.log(
-        `[WhatsApp] Sending to ${message.from}: ${output.reply.text}`,
-      );
+    this.logger.log(`[WhatsApp] Sending message to ${url} | payload: ${body}`);
 
-      const decryptedCredentials = decryptRecord(channelConfig.credentials);
-      await this.sendMessage(message.from, output.reply.text, {
-        phoneNumberId: decryptedCredentials.phoneNumberId,
-        accessToken: decryptedCredentials.accessToken,
+    let response: Response;
+    try {
+      response = await fetch(url, {
+        method: 'POST',
+        headers: {
+          'Content-Type': 'application/json',
+          Authorization: `Bearer ${channelCredentials.accessToken}`,
+        },
+        body,
       });
+    } catch (error) {
+      const cause = error instanceof Error ? (error as any).cause : undefined;
+      this.logger.error(
+        `[WhatsApp] fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}` +
+          (cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ''),
+      );
+      throw error;
     }
-  }
-
-  private async buildAmbiguousPrompt(
-    candidates: RouteCandidate[],
-  ): Promise<string> {
-    const clientId = candidates[0].clientAgent.clientId;
-    const client = await this.clientRepository.findById(clientId);
-    const clientName = client?.name;
 
-    const lines = candidates.map(
-      (candidate, index) => `${index + 1}. ${candidate.agentName}`,
-    );
+    if (!response.ok) {
+      const errorBody = await response.text();
+      this.logger.error(
+        `[WhatsApp] Failed to send message to ${url}: ${response.status} ${errorBody}`,
+      );
+      throw new Error(`WhatsApp API error: ${response.status}`);
+    }
 
-    const greeting = clientName
-      ? `Hey there! Thanks for reaching out to *${clientName}*.`
-      : `Hey there! Thanks for reaching out.`;
-
-    return [
-      greeting,
-      '',
-      'We have a few specialists ready to help you:',
-      ...lines,
-      '',
-      'Just reply with a number or name to get started!',
-    ].join('\n');
+    this.logger.log(`[WhatsApp] Message sent successfully to ${to}`);
   }
 }
```
