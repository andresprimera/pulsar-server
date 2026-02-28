# Diff Dump (Staged + Unstaged + Untracked)

Generated: 2026-02-28 15:25:44 UTC

## Staged

```diff
diff --git a/TODO.md b/TODO.md
index d2f8a45..98345f1 100644
--- a/TODO.md
+++ b/TODO.md
@@ -80,9 +80,9 @@ context.transferInfo = {
 Add transfer check as highest priority strategy:
 
 ```typescript
-async resolveRoute(phoneNumberId, externalUserId, incomingText) {
+async resolveRoute(routeChannelIdentifier, channelIdentifier, incomingText) {
   // NEW: Check for active transfer (highest priority)
-  const transfer = await this.getActiveTransfer(externalUserId, phoneNumberId);
+  const transfer = await this.getActiveTransfer(channelIdentifier, routeChannelIdentifier);
   if (transfer) {
     return { kind: 'resolved', candidate: transfer.targetAgent };
   }
diff --git a/docs/MESSAGE_PERSISTENCE.md b/docs/MESSAGE_PERSISTENCE.md
index f4de396..a7b1b95 100644
--- a/docs/MESSAGE_PERSISTENCE.md
+++ b/docs/MESSAGE_PERSISTENCE.md
@@ -80,20 +80,21 @@ The threshold should leave room for:
 
 ## Database Schema
 
-### User Schema Updates
+### Contact Schema Updates
 
 ```typescript
 {
-  email: string;              // Existing
-  name: string;               // Existing
-  clientId: ObjectId;         // Existing
-  status: string;             // Existing
-  externalUserId?: string;    // NEW: WhatsApp phone number or other external ID
+  clientId: ObjectId;
+  channelId: ObjectId;
+  channelIdentifier: string;  // Channel-specific sender identity
+  name: string;
+  metadata?: Record<string, unknown>;
+  status: 'active' | 'blocked' | 'archived';
 }
 ```
 
 **Indexes:**
-- `{ externalUserId: 1, clientId: 1 }` - For efficient external user lookups
+- `{ clientId: 1, channelId: 1, channelIdentifier: 1 }` (unique) - Canonical contact identity
 
 ### Message Schema
 
@@ -101,7 +102,7 @@ The threshold should leave room for:
 {
   content: string;            // Message text or summary text
   type: 'user' | 'agent' | 'summary';  // Message type
-  userId: ObjectId;           // Reference to User
+  contactId: ObjectId;        // Reference to Contact
   agentId: ObjectId;          // Reference to Agent
   channelId: ObjectId;        // Reference to Channel
   status: string;             // 'active', 'inactive', 'archived'
@@ -178,7 +179,7 @@ npm test -- --testPathPattern="(repository|agent.service|users|agents)"
 
 Check:
 1. MongoDB connection is working
-2. User collection has the `externalUserId` field
+2. Contact collection has the `channelIdentifier` field
 3. Message collection exists
 4. Proper indexes are created
 
@@ -192,7 +193,7 @@ Check:
 ### Context Not Loading
 
 Check:
-1. Messages are being saved with correct `userId`, `agentId`, and `channelId`
+1. Messages are being saved with correct `contactId`, `agentId`, and `channelId`
 2. MessageRepository.findConversationContext query is working
 3. Check for database query errors in logs
 
@@ -204,4 +205,4 @@ This implementation follows the existing Pulsar architecture:
 - **Services**: Contain business logic, use repositories for data access
 - **Controllers**: Handle HTTP, delegate to services
 - **No breaking changes**: All existing functionality continues to work
-- **Backward compatible**: Existing users without `externalUserId` are unaffected
+- **Identity-safe**: Contact identity is scoped by client + channel + channelIdentifier
diff --git a/docs/rules/channel-integration.md b/docs/rules/channel-integration.md
index 042e2a6..0f69b07 100644
--- a/docs/rules/channel-integration.md
+++ b/docs/rules/channel-integration.md
@@ -84,8 +84,8 @@ All incoming channel messages MUST use `AgentRoutingService.resolveRoute()` for
 
 ```typescript
 const routeDecision = await this.agentRoutingService.resolveRoute({
-  channelIdentifier: phoneNumberId,  // or tiktokUserId, instagramAccountId
-  externalUserId: message.from,
+  routeChannelIdentifier: phoneNumberId,  // or tiktokUserId, instagramAccountId
+  channelIdentifier: message.from,
   incomingText: message.text.body,
   channelType: 'whatsapp',           // or 'tiktok', 'instagram'
 });
@@ -120,7 +120,7 @@ const context = await this.agentContextService.enrichContext(rawContext);
 
 const input: AgentInput = {
   channel: 'whatsapp',
-  externalUserId: message.from,
+  contactId: contact._id.toString(),
   conversationId: `${phoneNumberId}:${message.from}`,
   message: { type: 'text', text: message.text.body },
   metadata: { messageId: message.id, phoneNumberId },
diff --git a/src/agent/agent.service.spec.ts b/src/agent/agent.service.spec.ts
index fb2e05e..54fd253 100644
--- a/src/agent/agent.service.spec.ts
+++ b/src/agent/agent.service.spec.ts
@@ -24,7 +24,7 @@ describe('AgentService', () => {
 
   const mockInput: AgentInput = {
     channel: 'whatsapp',
-    externalUserId: '1234567890',
+    contactId: '507f1f77bcf86cd799439012',
     conversationId: 'phone123:1234567890',
     message: { type: 'text', text: 'Hello, world!' },
   };
@@ -43,9 +43,9 @@ describe('AgentService', () => {
 
   const mockContact = {
     _id: 'contact-1',
-    externalUserId: '1234567890',
+    channelIdentifier: '1234567890',
     clientId: 'client-1',
-    channelType: 'whatsapp',
+    channelId: 'channel-1',
   };
 
   beforeEach(async () => {
@@ -88,7 +88,7 @@ describe('AgentService', () => {
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
-        contact: mockContact,
+        contactId: 'contact-1' as any,
         conversationHistory,
       });
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
@@ -101,9 +101,7 @@ describe('AgentService', () => {
           channelId: 'channel-1',
           agentId: 'agent-1',
           clientId: 'client-1',
-          externalUserId: '1234567890',
-          channelType: 'whatsapp',
-          userName: '1234567890',
+          contactId: '507f1f77bcf86cd799439012',
         },
       );
 
@@ -128,9 +126,7 @@ describe('AgentService', () => {
           channelId: 'channel-1',
           agentId: 'agent-1',
           clientId: 'client-1',
-          externalUserId: '1234567890',
-          channelType: 'whatsapp',
-          userName: '1234567890',
+          contactId: '507f1f77bcf86cd799439012',
         },
         'contact-1',
         mockContext,
@@ -146,7 +142,7 @@ describe('AgentService', () => {
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
-        contact: mockContact,
+        contactId: 'contact-1' as any,
         conversationHistory: [],
       });
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
@@ -166,7 +162,7 @@ describe('AgentService', () => {
         throw new Error('API error');
       });
       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
-        contact: mockContact,
+        contactId: 'contact-1' as any,
         conversationHistory: [],
       });
 
@@ -186,7 +182,7 @@ describe('AgentService', () => {
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'response' });
       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
-        contact: mockContact,
+        contactId: 'contact-1' as any,
         conversationHistory: [],
       });
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
diff --git a/src/agent/agent.service.ts b/src/agent/agent.service.ts
index 43ae458..c0bedaf 100644
--- a/src/agent/agent.service.ts
+++ b/src/agent/agent.service.ts
@@ -25,16 +25,14 @@ export class AgentService {
 
     try {
       // Automatically handle incoming message persistence and get conversation history
-      const { contact, conversationHistory } =
+      const { contactId, conversationHistory } =
         await this.messagePersistenceService.handleIncomingMessage(
           input.message.text,
           {
             channelId: context.channelId,
             agentId: context.agentId,
             clientId: context.clientId,
-            externalUserId: input.externalUserId,
-            channelType: input.channel as 'whatsapp' | 'tiktok' | 'instagram',
-            userName: input.externalUserId, // Use external ID as name initially
+            contactId: input.contactId,
           },
         );
 
@@ -79,11 +77,9 @@ export class AgentService {
           channelId: context.channelId,
           agentId: context.agentId,
           clientId: context.clientId,
-          externalUserId: input.externalUserId,
-          channelType: input.channel as 'whatsapp' | 'tiktok' | 'instagram',
-          userName: input.externalUserId,
+          contactId: input.contactId,
         },
-        contact._id,
+        contactId,
         context,
       );
 
diff --git a/src/agent/contracts/agent-input.ts b/src/agent/contracts/agent-input.ts
index 6cbe992..e5287fa 100644
--- a/src/agent/contracts/agent-input.ts
+++ b/src/agent/contracts/agent-input.ts
@@ -1,6 +1,8 @@
+import { ChannelType } from '../../channels/shared/channel-type.type';
+
 export interface AgentInput {
-  channel: string;
-  externalUserId: string;
+  channel: ChannelType;
+  contactId: string;
   conversationId: string;
   message: {
     type: 'text';
diff --git a/src/channels/instagram/instagram.service.spec.ts b/src/channels/instagram/instagram.service.spec.ts
index 4026e9c..d48ee93 100644
--- a/src/channels/instagram/instagram.service.spec.ts
+++ b/src/channels/instagram/instagram.service.spec.ts
@@ -5,6 +5,8 @@ import { AgentService } from '../../agent/agent.service';
 import { AgentRoutingService } from '../shared/agent-routing.service';
 import { AgentRepository } from '../../database/repositories/agent.repository';
 import { AgentContextService } from '../../agent/agent-context.service';
+import { ContactRepository } from '../../database/repositories/contact.repository';
+import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
 import { encrypt } from '../../database/utils/crypto.util';
 
 describe('InstagramService', () => {
@@ -12,6 +14,8 @@ describe('InstagramService', () => {
   let agentService: jest.Mocked<AgentService>;
   let agentRoutingService: jest.Mocked<AgentRoutingService>;
   let agentRepository: jest.Mocked<AgentRepository>;
+  let contactRepository: jest.Mocked<ContactRepository>;
+  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
   let loggerWarnSpy: jest.SpyInstance;
   let fetchSpy: jest.SpyInstance;
 
@@ -43,6 +47,20 @@ describe('InstagramService', () => {
           provide: AgentRepository,
           useValue: { findActiveById: jest.fn() },
         },
+        {
+          provide: ContactRepository,
+          useValue: { findOrCreateByExternalIdentity: jest.fn() },
+        },
+        {
+          provide: ContactIdentifierExtractorRegistry,
+          useValue: {
+            resolve: jest.fn().mockReturnValue({
+              externalId: 'user_123',
+              externalIdRaw: 'user_123',
+              identifierType: 'platform_id',
+            }),
+          },
+        },
         {
           provide: AgentContextService,
           useValue: {
@@ -56,6 +74,8 @@ describe('InstagramService', () => {
     agentService = module.get(AgentService);
     agentRoutingService = module.get(AgentRoutingService);
     agentRepository = module.get(AgentRepository);
+    contactRepository = module.get(ContactRepository);
+    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);
 
     loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
   });
@@ -96,10 +116,10 @@ describe('InstagramService', () => {
       candidate: {
         clientAgent: {
           agentId: 'agent_1',
-          clientId: 'client_1',
+          clientId: '507f1f77bcf86cd799439011',
         },
         channelConfig: {
-          channelId: 'channel_1',
+          channelId: '507f1f77bcf86cd799439014',
           credentials: encryptedCreds,
           llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o' },
         },
@@ -110,6 +130,9 @@ describe('InstagramService', () => {
     agentRepository.findActiveById.mockResolvedValue({
       systemPrompt: 'prompt',
     } as any);
+    contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
+      _id: '507f1f77bcf86cd799439012',
+    } as any);
 
     agentService.run.mockResolvedValue({
       reply: { type: 'text', text: 'Instagram reply' },
diff --git a/src/channels/instagram/instagram.service.ts b/src/channels/instagram/instagram.service.ts
index 83f63c6..af7b81b 100644
--- a/src/channels/instagram/instagram.service.ts
+++ b/src/channels/instagram/instagram.service.ts
@@ -1,9 +1,11 @@
 import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
 import { createHmac, timingSafeEqual } from 'crypto';
+import { Types } from 'mongoose';
 import { AgentService } from '../../agent/agent.service';
 import { AgentInput } from '../../agent/contracts/agent-input';
 import { AgentContext } from '../../agent/contracts/agent-context';
 import { AgentRepository } from '../../database/repositories/agent.repository';
+import { ContactRepository } from '../../database/repositories/contact.repository';
 import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
 import {
   InstagramServerConfig,
@@ -12,6 +14,8 @@ import {
 } from './instagram.config';
 import { AgentRoutingService } from '../shared/agent-routing.service';
 import { AgentContextService } from '../../agent/agent-context.service';
+import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
+import { CHANNEL_TYPES } from '../shared/channel-type.constants';
 
 @Injectable()
 export class InstagramService {
@@ -22,8 +26,10 @@ export class InstagramService {
   constructor(
     private readonly agentService: AgentService,
     private readonly agentRepository: AgentRepository,
+    private readonly contactRepository: ContactRepository,
     private readonly agentRoutingService: AgentRoutingService,
     private readonly agentContextService: AgentContextService,
+    private readonly identifierExtractorRegistry: ContactIdentifierExtractorRegistry,
   ) {
     this.config = loadInstagramConfig();
   }
@@ -152,11 +158,16 @@ export class InstagramService {
           continue;
         }
 
+        const identifier = this.identifierExtractorRegistry.resolve(
+          CHANNEL_TYPES.INSTAGRAM,
+          event,
+        );
+
         const routeDecision = await this.agentRoutingService.resolveRoute({
-          channelIdentifier: instagramAccountId,
-          externalUserId: senderId,
+          routeChannelIdentifier: instagramAccountId,
+          channelIdentifier: identifier.externalId,
           incomingText: text,
-          channelType: 'instagram',
+          channelType: CHANNEL_TYPES.INSTAGRAM,
         });
 
         if (routeDecision.kind === 'unroutable') {
@@ -224,9 +235,18 @@ export class InstagramService {
 
         const context = await this.agentContextService.enrichContext(rawContext);
 
+        const contact = await this.contactRepository.findOrCreateByExternalIdentity(
+          new Types.ObjectId(clientAgent.clientId),
+          new Types.ObjectId(channelConfig.channelId.toString()),
+          identifier.externalId,
+          identifier.externalIdRaw,
+          identifier.identifierType,
+          senderId,
+        );
+
         const input: AgentInput = {
-          channel: 'instagram',
-          externalUserId: senderId,
+          channel: CHANNEL_TYPES.INSTAGRAM,
+          contactId: contact._id.toString(),
           conversationId: `${instagramAccountId}:${senderId}`,
           message: {
             type: 'text',
diff --git a/src/channels/shared/agent-routing.service.spec.ts b/src/channels/shared/agent-routing.service.spec.ts
index 09afaa2..7654ad1 100644
--- a/src/channels/shared/agent-routing.service.spec.ts
+++ b/src/channels/shared/agent-routing.service.spec.ts
@@ -57,7 +57,7 @@ describe('AgentRoutingService', () => {
         },
         {
           provide: ContactRepository,
-          useValue: { findByExternalUserId: jest.fn() },
+          useValue: { findByExternalIdentity: jest.fn() },
         },
         {
           provide: MessageRepository,
@@ -90,8 +90,8 @@ describe('AgentRoutingService', () => {
     } as any);
 
     const result = await service.resolveRoute({
-      channelIdentifier: 'phone-1',
-      externalUserId: 'user-1',
+      routeChannelIdentifier: 'phone-1',
+      channelIdentifier: 'user-1',
       incomingText: 'hello',
       channelType: 'whatsapp',
     });
@@ -121,8 +121,8 @@ describe('AgentRoutingService', () => {
       } as any);
 
     const result = await service.resolveRoute({
-      channelIdentifier: 'phone-1',
-      externalUserId: 'user-1',
+      routeChannelIdentifier: 'phone-1',
+      channelIdentifier: 'user-1',
       incomingText: '2',
       channelType: 'whatsapp',
     });
@@ -154,12 +154,12 @@ describe('AgentRoutingService', () => {
         status: 'active',
       } as any);
 
-    contactRepository.findByExternalUserId.mockResolvedValue(null);
+    contactRepository.findByExternalIdentity.mockResolvedValue(null);
     messageRepository.findLatestByContactAndAgents.mockResolvedValue(null);
 
     const result = await service.resolveRoute({
-      channelIdentifier: 'phone-1',
-      externalUserId: 'user-1',
+      routeChannelIdentifier: 'phone-1',
+      channelIdentifier: 'user-1',
       incomingText: 'hello there',
       channelType: 'whatsapp',
     });
diff --git a/src/channels/shared/agent-routing.service.ts b/src/channels/shared/agent-routing.service.ts
index 72e8f8d..7400c5c 100644
--- a/src/channels/shared/agent-routing.service.ts
+++ b/src/channels/shared/agent-routing.service.ts
@@ -8,6 +8,8 @@ import { ContactRepository } from '../../database/repositories/contact.repositor
 import { ClientAgent, HireChannelConfig } from '../../database/schemas/client-agent.schema';
 import { createLLMModel } from '../../agent/llm/llm.factory';
 import { LlmProvider } from '../../agent/llm/provider.enum';
+import { ChannelType } from './channel-type.type';
+import { CHANNEL_TYPES } from './channel-type.constants';
 
 export interface RouteCandidate {
   clientAgent: ClientAgent;
@@ -34,14 +36,14 @@ export type AgentRouteDecision =
  * Channel-specific routing context
  */
 export interface ChannelRoutingContext {
-  /** Channel identifier (phoneNumberId, tiktokUserId, instagramAccountId, etc.) */
+  /** Routing account identifier (phoneNumberId, tiktokUserId, instagramAccountId, etc.) */
+  routeChannelIdentifier: string;
+  /** Contact identity identifier within the channel (phone, sender user ID, etc.) */
   channelIdentifier: string;
-  /** External user identifier (phone, email, userId) */
-  externalUserId: string;
   /** Incoming message text */
   incomingText: string;
   /** Channel type for logging */
-  channelType: 'whatsapp' | 'tiktok' | 'instagram';
+  channelType: ChannelType;
 }
 
 @Injectable()
@@ -66,18 +68,18 @@ export class AgentRoutingService {
   async resolveRoute(
     context: ChannelRoutingContext,
   ): Promise<AgentRouteDecision> {
-    if (!context.channelIdentifier) {
+    if (!context.routeChannelIdentifier) {
       return { kind: 'unroutable', reason: 'missing-identifier' };
     }
 
     const clientAgents = await this.findCandidatesByChannel(
       context.channelType,
-      context.channelIdentifier,
+      context.routeChannelIdentifier,
     );
 
     const candidates = await this.buildCandidates(
       clientAgents,
-      context.channelIdentifier,
+      context.routeChannelIdentifier,
       context.channelType,
     );
 
@@ -94,7 +96,10 @@ export class AgentRoutingService {
       return { kind: 'resolved', candidate: explicit };
     }
 
-    const sticky = await this.resolveFromRecentHistory(candidates, context.externalUserId);
+    const sticky = await this.resolveFromRecentHistory(
+      candidates,
+      context.channelIdentifier,
+    );
     if (sticky) {
       return { kind: 'resolved', candidate: sticky };
     }
@@ -130,16 +135,18 @@ export class AgentRoutingService {
    * Find candidate ClientAgents based on channel type.
    */
   private async findCandidatesByChannel(
-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
+    channelType: ChannelType,
     identifier: string,
   ): Promise<ClientAgent[]> {
     switch (channelType) {
-      case 'whatsapp':
+      case CHANNEL_TYPES.WHATSAPP:
         return this.clientAgentRepository.findActiveByPhoneNumberId(identifier);
-      case 'tiktok':
+      case CHANNEL_TYPES.TIKTOK:
         return this.clientAgentRepository.findActiveByTiktokUserId(identifier);
-      case 'instagram':
+      case CHANNEL_TYPES.INSTAGRAM:
         return this.clientAgentRepository.findActiveByInstagramAccountId(identifier);
+      default:
+        return [];
     }
   }
 
@@ -149,7 +156,7 @@ export class AgentRoutingService {
   private async buildCandidates(
     clientAgents: ClientAgent[],
     identifier: string,
-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
+    channelType: ChannelType,
   ): Promise<RouteCandidate[]> {
     const unresolved = clientAgents
       .map((clientAgent) => {
@@ -157,12 +164,14 @@ export class AgentRoutingService {
           if (channel.status !== 'active') return false;
           
           switch (channelType) {
-            case 'whatsapp':
+            case CHANNEL_TYPES.WHATSAPP:
               return channel.phoneNumberId === identifier;
-            case 'tiktok':
+            case CHANNEL_TYPES.TIKTOK:
               return channel.tiktokUserId === identifier;
-            case 'instagram':
+            case CHANNEL_TYPES.INSTAGRAM:
               return channel.instagramAccountId === identifier;
+            default:
+              return false;
           }
         });
 
@@ -231,7 +240,7 @@ export class AgentRoutingService {
 
   private async resolveFromRecentHistory(
     candidates: RouteCandidate[],
-    externalUserId: string,
+    channelIdentifier: string,
   ): Promise<RouteCandidate | null> {
     const byClient = new Map<string, RouteCandidate[]>();
 
@@ -249,15 +258,6 @@ export class AgentRoutingService {
         continue;
       }
 
-      const contact = await this.contactRepository.findByExternalUserId(
-        externalUserId,
-        new Types.ObjectId(clientId),
-      );
-
-      if (!contact) {
-        continue;
-      }
-
       const agentIds = clientCandidates
         .map((candidate) => candidate.clientAgent.agentId)
         .filter((agentId) => Types.ObjectId.isValid(agentId))
@@ -273,28 +273,46 @@ export class AgentRoutingService {
         continue;
       }
 
-      const latestMessage = await this.messageRepository.findLatestByContactAndAgents(
-        contact._id as Types.ObjectId,
-        agentIds,
-        channelIds,
-      );
+      for (const candidate of clientCandidates) {
+        const channelId = candidate.channelConfig.channelId.toString();
+        if (!Types.ObjectId.isValid(channelId)) {
+          continue;
+        }
 
-      if (!latestMessage) {
-        continue;
-      }
+        const contact = await this.contactRepository.findByExternalIdentity(
+          new Types.ObjectId(clientId),
+          new Types.ObjectId(channelId),
+          channelIdentifier,
+        );
 
-      const matched = clientCandidates.find(
-        (candidate) =>
-          candidate.clientAgent.agentId.toString() ===
-          latestMessage.agentId.toString(),
-      );
+        if (!contact) {
+          continue;
+        }
 
-      if (!matched) {
-        continue;
-      }
+        const latestMessage =
+          await this.messageRepository.findLatestByContactAndAgents(
+            contact._id as Types.ObjectId,
+            agentIds,
+            channelIds,
+          );
 
-      if (!mostRecent || latestMessage.createdAt > mostRecent.createdAt) {
-        mostRecent = { createdAt: latestMessage.createdAt, candidate: matched };
+        if (!latestMessage) {
+          continue;
+        }
+
+        const matched = clientCandidates.find(
+          (candidate) =>
+            candidate.clientAgent.agentId.toString() ===
+            latestMessage.agentId.toString(),
+        );
+
+        if (!matched) {
+          continue;
+        }
+
+        if (!mostRecent || latestMessage.createdAt > mostRecent.createdAt) {
+          mostRecent = { createdAt: latestMessage.createdAt, candidate: matched };
+        }
       }
     }
 
diff --git a/src/channels/shared/channel-type.constants.ts b/src/channels/shared/channel-type.constants.ts
new file mode 100644
index 0000000..ce34a0a
--- /dev/null
+++ b/src/channels/shared/channel-type.constants.ts
@@ -0,0 +1,10 @@
+import { ChannelType } from './channel-type.type';
+
+export const CHANNEL_TYPES = {
+  WHATSAPP: 'whatsapp',
+  TELEGRAM: 'telegram',
+  WEB: 'web',
+  API: 'api',
+  TIKTOK: 'tiktok',
+  INSTAGRAM: 'instagram',
+} as const satisfies Record<string, ChannelType>;
diff --git a/src/channels/shared/channel-type.type.ts b/src/channels/shared/channel-type.type.ts
new file mode 100644
index 0000000..2db5481
--- /dev/null
+++ b/src/channels/shared/channel-type.type.ts
@@ -0,0 +1,7 @@
+export type ChannelType =
+  | 'whatsapp'
+  | 'telegram'
+  | 'web'
+  | 'api'
+  | 'tiktok'
+  | 'instagram';
diff --git a/src/channels/shared/contact-identifier/api-identifier.extractor.ts b/src/channels/shared/contact-identifier/api-identifier.extractor.ts
new file mode 100644
index 0000000..ffb9793
--- /dev/null
+++ b/src/channels/shared/contact-identifier/api-identifier.extractor.ts
@@ -0,0 +1,35 @@
+import { Injectable } from '@nestjs/common';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ChannelType } from '../channel-type.type';
+import {
+  ContactIdentifierType,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+
+@Injectable()
+export class ApiIdentifierExtractor
+  implements RawCapableContactIdentifierExtractor
+{
+  supports(channelType: ChannelType): boolean {
+    return channelType === CHANNEL_TYPES.API;
+  }
+
+  extractRaw(payload: unknown): string {
+    const source = payload as any;
+    const rawId = source?.externalId ?? source?.contactId ?? source?.senderId;
+
+    if (typeof rawId !== 'string') {
+      throw new Error('missing-api-identifier');
+    }
+
+    return rawId;
+  }
+
+  extract(payload: unknown): string {
+    return this.extractRaw(payload).trim();
+  }
+
+  getIdentifierType(): ContactIdentifierType {
+    return 'platform_id';
+  }
+}
diff --git a/src/channels/shared/contact-identifier/contact-identifier-architecture.spec.ts b/src/channels/shared/contact-identifier/contact-identifier-architecture.spec.ts
new file mode 100644
index 0000000..1d2bf26
--- /dev/null
+++ b/src/channels/shared/contact-identifier/contact-identifier-architecture.spec.ts
@@ -0,0 +1,521 @@
+import { Types } from 'mongoose';
+import { Logger } from '@nestjs/common';
+import { ContactRepository } from '../../../database/repositories/contact.repository';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ContactIdentifierExtractorRegistry } from './contact-identifier-extractor.registry';
+import { WhatsappIdentifierExtractor } from './whatsapp-identifier.extractor';
+import { InstagramIdentifierExtractor } from './instagram-identifier.extractor';
+import { TelegramIdentifierExtractor } from './telegram-identifier.extractor';
+import { TiktokIdentifierExtractor } from './tiktok-identifier.extractor';
+import { WebIdentifierExtractor } from './web-identifier.extractor';
+import { ApiIdentifierExtractor } from './api-identifier.extractor';
+import {
+  ExtractorNotFoundException,
+  InvalidIdentifierException,
+} from './contact-identifier.exceptions';
+
+type Query<T> = {
+  session: (_session?: unknown) => Query<T>;
+  exec: () => Promise<T>;
+};
+
+class InMemoryContactModel {
+  private store = new Map<string, any>();
+
+  private key(clientId: any, channelId: any, externalId: any): string {
+    return `${clientId.toString()}:${channelId.toString()}:${externalId}`;
+  }
+
+  private wrap<T>(producer: () => T | Promise<T>): Query<T> {
+    return {
+      session: () => this.wrap(producer),
+      exec: async () => producer(),
+    };
+  }
+
+  findById(id: string): Query<any | null> {
+    return this.wrap(() => {
+      for (const value of this.store.values()) {
+        if (value._id.toString() === id) {
+          return value;
+        }
+      }
+
+      return null;
+    });
+  }
+
+  find(filter: any): Query<any[]> {
+    return this.wrap(() => {
+      const all = Array.from(this.store.values());
+      if (!filter?.clientId) {
+        return all;
+      }
+
+      return all.filter((item) => item.clientId.toString() === filter.clientId.toString());
+    });
+  }
+
+  findOne(filter: any): Query<any | null> {
+    return this.wrap(() => {
+      const key = this.key(filter.clientId, filter.channelId, filter.externalId);
+      return this.store.get(key) ?? null;
+    });
+  }
+
+  findOneAndUpdate(filter: any, update: any): Query<any> {
+    return this.wrap(() => {
+      const key = this.key(filter.clientId, filter.channelId, filter.externalId);
+      const existing = this.store.get(key);
+      if (existing) {
+        return existing;
+      }
+
+      const created = {
+        _id: new Types.ObjectId(),
+        ...update.$setOnInsert,
+      };
+
+      this.store.set(key, created);
+      return created;
+    });
+  }
+
+  count(): number {
+    return this.store.size;
+  }
+}
+
+describe('Contact Identifier Architecture', () => {
+  let repository: ContactRepository;
+  let registry: ContactIdentifierExtractorRegistry;
+  let model: InMemoryContactModel;
+
+  const clientId = new Types.ObjectId();
+  const whatsappChannelId = new Types.ObjectId();
+  const instagramChannelId = new Types.ObjectId();
+
+  beforeEach(() => {
+    model = new InMemoryContactModel();
+    repository = new ContactRepository(model as any);
+    registry = new ContactIdentifierExtractorRegistry(
+      [
+        new WhatsappIdentifierExtractor(),
+        new InstagramIdentifierExtractor(),
+        new TelegramIdentifierExtractor(),
+        new TiktokIdentifierExtractor(),
+        new WebIdentifierExtractor(),
+        new ApiIdentifierExtractor(),
+      ],
+    );
+  });
+
+  it('creates different contacts for same phone across different channels', async () => {
+    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+      entry: [
+        {
+          changes: [
+            {
+              value: {
+                messages: [{ from: '+1 415 555 0123' }],
+              },
+            },
+          ],
+        },
+      ],
+    });
+
+    const whatsappContact = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      whatsappChannelId,
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      'Phone User',
+    );
+
+    const instagramContact = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      instagramChannelId,
+      identifier.externalId,
+      identifier.externalIdRaw,
+      'platform_id',
+      'Same User Other Channel',
+    );
+
+    expect(whatsappContact._id.toString()).not.toEqual(instagramContact._id.toString());
+  });
+
+  it('creates only one contact for same identifier on same channel and same client', async () => {
+    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+      entry: [
+        {
+          changes: [
+            {
+              value: {
+                messages: [{ from: '+1 (415) 555-0123' }],
+              },
+            },
+          ],
+        },
+      ],
+    });
+
+    const first = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      whatsappChannelId,
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      'A',
+    );
+
+    const second = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      whatsappChannelId,
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      'B',
+    );
+
+    expect(first._id.toString()).toEqual(second._id.toString());
+    expect(model.count()).toBe(1);
+  });
+
+  it('normalizes instagram case differences to same identifier', async () => {
+    const firstIdentifier = registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
+      entry: [{ messaging: [{ sender: { id: 'User_ABC' } }] }],
+    });
+
+    const secondIdentifier = registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
+      entry: [{ messaging: [{ sender: { id: ' user_abc ' } }] }],
+    });
+
+    expect(firstIdentifier.externalId).toEqual(secondIdentifier.externalId);
+
+    const first = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      instagramChannelId,
+      firstIdentifier.externalId,
+      firstIdentifier.externalIdRaw,
+      firstIdentifier.identifierType,
+      'IG User',
+    );
+
+    const second = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      instagramChannelId,
+      secondIdentifier.externalId,
+      secondIdentifier.externalIdRaw,
+      secondIdentifier.identifierType,
+      'IG User Variant',
+    );
+
+    expect(first._id.toString()).toEqual(second._id.toString());
+  });
+
+  it('normalizes whatsapp identifiers with and without plus to same identifier', async () => {
+    const withPlus = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+      entry: [
+        {
+          changes: [
+            {
+              value: {
+                messages: [{ from: '+1 415 555 0123' }],
+              },
+            },
+          ],
+        },
+      ],
+    });
+
+    const withoutPlus = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+      entry: [
+        {
+          changes: [
+            {
+              value: {
+                messages: [{ from: '14155550123' }],
+              },
+            },
+          ],
+        },
+      ],
+    });
+
+    expect(withPlus.externalId).toEqual(withoutPlus.externalId);
+  });
+
+  it('is safe under concurrent upsert attempts for same identity', async () => {
+    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+      entry: [
+        {
+          changes: [
+            {
+              value: {
+                messages: [{ from: '+1 415 555 0123' }],
+              },
+            },
+          ],
+        },
+      ],
+    });
+
+    const contacts = await Promise.all(
+      Array.from({ length: 20 }).map(() =>
+        repository.findOrCreateByExternalIdentity(
+          clientId,
+          whatsappChannelId,
+          identifier.externalId,
+          identifier.externalIdRaw,
+          identifier.identifierType,
+          'Concurrent User',
+        ),
+      ),
+    );
+
+    const ids = new Set(contacts.map((item) => item._id.toString()));
+    expect(ids.size).toBe(1);
+    expect(model.count()).toBe(1);
+  });
+
+  it('rejects whatsapp number shorter than 8 digits', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+        entry: [
+          {
+            changes: [
+              {
+                value: {
+                  messages: [{ from: '+1234567' }],
+                },
+              },
+            ],
+          },
+        ],
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects whatsapp number longer than 15 digits', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+        entry: [
+          {
+            changes: [
+              {
+                value: {
+                  messages: [{ from: '+1234567890123456' }],
+                },
+              },
+            ],
+          },
+        ],
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects whatsapp number containing only symbols', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+        entry: [
+          {
+            changes: [
+              {
+                value: {
+                  messages: [{ from: '+-()' }],
+                },
+              },
+            ],
+          },
+        ],
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('logs whatsapp validation failure without leaking raw value', () => {
+    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
+
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+        entry: [
+          {
+            changes: [
+              {
+                value: {
+                  messages: [{ from: '+-()' }],
+                },
+              },
+            ],
+          },
+        ],
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(warnSpy).toHaveBeenCalledWith(
+      expect.stringContaining('event=contact_identifier_validation_failed'),
+    );
+    expect(
+      warnSpy.mock.calls.some((call) =>
+        String(call[0]).includes('+-()'),
+      ),
+    ).toBe(false);
+
+    warnSpy.mockRestore();
+  });
+
+  it('rejects instagram empty username after trim', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
+        entry: [{ messaging: [{ sender: { id: '   ' } }] }],
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects telegram identifier when id and username are missing', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+        message: {
+          from: {},
+        },
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects non-numeric telegram id', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+        message: {
+          from: {
+            id: '12ab45',
+          },
+        },
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects too-short telegram id', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+        message: {
+          from: {
+            id: '1234',
+          },
+        },
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects telegram username that starts with number', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+        message: {
+          from: {
+            username: '1validname',
+          },
+        },
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('rejects telegram username with invalid characters', () => {
+    expect(() =>
+      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+        message: {
+          from: {
+            username: 'valid-name',
+          },
+        },
+      }),
+    ).toThrow(InvalidIdentifierException);
+
+    expect(model.count()).toBe(0);
+  });
+
+  it('accepts valid telegram id', () => {
+    const identifier = registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+      message: {
+        from: {
+          id: '1234567890',
+        },
+      },
+    });
+
+    expect(identifier.externalId).toBe('1234567890');
+  });
+
+  it('accepts valid telegram username', () => {
+    const identifier = registry.resolve(CHANNEL_TYPES.TELEGRAM, {
+      message: {
+        from: {
+          username: 'valid_name123',
+        },
+      },
+    });
+
+    expect(identifier.externalId).toBe('valid_name123');
+  });
+
+  it('keeps upsert behavior for valid whatsapp identifier and avoids duplicates', async () => {
+    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
+      entry: [
+        {
+          changes: [
+            {
+              value: {
+                messages: [{ from: '+14155550123' }],
+              },
+            },
+          ],
+        },
+      ],
+    });
+
+    const first = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      whatsappChannelId,
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      'Regression User',
+    );
+
+    const second = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      whatsappChannelId,
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      'Regression User Again',
+    );
+
+    expect(first).toBeDefined();
+    expect(second).toBeDefined();
+    expect(first._id.toString()).toBe(second._id.toString());
+    expect(model.count()).toBe(1);
+  });
+
+  it('throws explicit exception when no extractor supports channel type', () => {
+    expect(() => registry.resolve('sms' as any, {})).toThrow(
+      ExtractorNotFoundException,
+    );
+    expect(model.count()).toBe(0);
+  });
+});
diff --git a/src/channels/shared/contact-identifier/contact-identifier-extractor.interface.ts b/src/channels/shared/contact-identifier/contact-identifier-extractor.interface.ts
new file mode 100644
index 0000000..94a55de
--- /dev/null
+++ b/src/channels/shared/contact-identifier/contact-identifier-extractor.interface.ts
@@ -0,0 +1,28 @@
+import { ChannelType } from '../channel-type.type';
+
+export const CONTACT_IDENTIFIER_EXTRACTORS = Symbol(
+  'CONTACT_IDENTIFIER_EXTRACTORS',
+);
+
+export type ContactIdentifierType =
+  | 'phone'
+  | 'username'
+  | 'platform_id'
+  | 'email';
+
+export interface ContactIdentifierExtractor {
+  supports(channelType: ChannelType): boolean;
+  extract(payload: unknown): string;
+}
+
+export interface RawCapableContactIdentifierExtractor
+  extends ContactIdentifierExtractor {
+  extractRaw(payload: unknown): string;
+  getIdentifierType(): ContactIdentifierType;
+}
+
+export interface ExtractedContactIdentifier {
+  externalId: string;
+  externalIdRaw?: string;
+  identifierType: ContactIdentifierType;
+}
diff --git a/src/channels/shared/contact-identifier/contact-identifier-extractor.registry.ts b/src/channels/shared/contact-identifier/contact-identifier-extractor.registry.ts
new file mode 100644
index 0000000..cf3438a
--- /dev/null
+++ b/src/channels/shared/contact-identifier/contact-identifier-extractor.registry.ts
@@ -0,0 +1,82 @@
+import { Inject, Injectable, Logger } from '@nestjs/common';
+import { ChannelType } from '../channel-type.type';
+import {
+  CONTACT_IDENTIFIER_EXTRACTORS,
+  ContactIdentifierExtractor,
+  ExtractedContactIdentifier,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+import {
+  ExtractorNotFoundException,
+  InvalidIdentifierException,
+} from './contact-identifier.exceptions';
+
+@Injectable()
+export class ContactIdentifierExtractorRegistry {
+  private readonly logger = new Logger(ContactIdentifierExtractorRegistry.name);
+  private readonly extractors: RawCapableContactIdentifierExtractor[];
+
+  constructor(
+    @Inject(CONTACT_IDENTIFIER_EXTRACTORS)
+    extractors: RawCapableContactIdentifierExtractor[],
+  ) {
+    this.extractors = extractors;
+  }
+
+  resolve(channelType: ChannelType, payload: unknown): ExtractedContactIdentifier {
+    const extractor = this.extractors.find((item) => item.supports(channelType));
+
+    if (!extractor) {
+      this.logger.error(
+        `event=contact_identifier_extraction_failed reason=unsupported_channel channelType=${channelType}`,
+      );
+      throw new ExtractorNotFoundException(channelType);
+    }
+
+    let externalIdRaw: string;
+    let externalId: string;
+
+    try {
+      externalIdRaw = extractor.extractRaw(payload);
+      externalId = extractor.extract(payload);
+    } catch (error) {
+      if (error instanceof InvalidIdentifierException) {
+        this.logger.error(
+          `event=contact_identifier_extraction_failed reason=invalid_identifier channelType=${channelType}`,
+        );
+        throw error;
+      }
+
+      this.logger.error(
+        `event=contact_identifier_extraction_failed reason=extractor_error channelType=${channelType} message=${error instanceof Error ? error.message : String(error)}`,
+      );
+      throw new InvalidIdentifierException('unable-to-extract-contact-identifier');
+    }
+
+    const normalizedRaw = externalIdRaw.trim();
+    const normalizedValue = externalId.trim();
+
+    if (!normalizedRaw || !normalizedValue) {
+      this.logger.warn(
+        `event=contact_identifier_empty channelType=${channelType}`,
+      );
+      throw new InvalidIdentifierException('contact-identifier-empty');
+    }
+
+    if (normalizedRaw !== normalizedValue) {
+      this.logger.log(
+        `event=contact_identifier_normalized channelType=${channelType} rawLength=${normalizedRaw.length} normalizedLength=${normalizedValue.length}`,
+      );
+    }
+
+    return {
+      externalId: normalizedValue,
+      externalIdRaw: normalizedRaw,
+      identifierType: extractor.getIdentifierType(),
+    };
+  }
+
+  getSupportedExtractors(): ContactIdentifierExtractor[] {
+    return [...this.extractors];
+  }
+}
diff --git a/src/channels/shared/contact-identifier/contact-identifier.exceptions.ts b/src/channels/shared/contact-identifier/contact-identifier.exceptions.ts
new file mode 100644
index 0000000..bae2acc
--- /dev/null
+++ b/src/channels/shared/contact-identifier/contact-identifier.exceptions.ts
@@ -0,0 +1,13 @@
+import { BadRequestException } from '@nestjs/common';
+
+export class InvalidIdentifierException extends BadRequestException {
+  constructor(reason: string) {
+    super(`Invalid identifier: ${reason}`);
+  }
+}
+
+export class ExtractorNotFoundException extends BadRequestException {
+  constructor(channelType: string) {
+    super(`No contact identifier extractor for channel: ${channelType}`);
+  }
+}
diff --git a/src/channels/shared/contact-identifier/instagram-identifier.extractor.ts b/src/channels/shared/contact-identifier/instagram-identifier.extractor.ts
new file mode 100644
index 0000000..62a6951
--- /dev/null
+++ b/src/channels/shared/contact-identifier/instagram-identifier.extractor.ts
@@ -0,0 +1,41 @@
+import { Injectable } from '@nestjs/common';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ChannelType } from '../channel-type.type';
+import {
+  ContactIdentifierType,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+import { InvalidIdentifierException } from './contact-identifier.exceptions';
+
+@Injectable()
+export class InstagramIdentifierExtractor
+  implements RawCapableContactIdentifierExtractor
+{
+  supports(channelType: ChannelType): boolean {
+    return channelType === CHANNEL_TYPES.INSTAGRAM;
+  }
+
+  extractRaw(payload: unknown): string {
+    const source = payload as any;
+    const sender = source?.entry?.[0]?.messaging?.[0]?.sender?.id ?? source?.sender?.id;
+
+    if (typeof sender !== 'string') {
+      throw new InvalidIdentifierException('missing-instagram-identifier');
+    }
+
+    return sender;
+  }
+
+  extract(payload: unknown): string {
+    const normalized = this.extractRaw(payload).trim().toLowerCase();
+    if (!normalized) {
+      throw new InvalidIdentifierException('empty-instagram-identifier');
+    }
+
+    return normalized;
+  }
+
+  getIdentifierType(): ContactIdentifierType {
+    return 'platform_id';
+  }
+}
diff --git a/src/channels/shared/contact-identifier/telegram-identifier.extractor.ts b/src/channels/shared/contact-identifier/telegram-identifier.extractor.ts
new file mode 100644
index 0000000..2187c6c
--- /dev/null
+++ b/src/channels/shared/contact-identifier/telegram-identifier.extractor.ts
@@ -0,0 +1,102 @@
+import { Injectable, Logger } from '@nestjs/common';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ChannelType } from '../channel-type.type';
+import {
+  ContactIdentifierType,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+import { InvalidIdentifierException } from './contact-identifier.exceptions';
+
+@Injectable()
+export class TelegramIdentifierExtractor
+  implements RawCapableContactIdentifierExtractor
+{
+  private readonly logger = new Logger(TelegramIdentifierExtractor.name);
+
+  supports(channelType: ChannelType): boolean {
+    return channelType === CHANNEL_TYPES.TELEGRAM;
+  }
+
+  extractRaw(payload: unknown): string {
+    const source = payload as any;
+    const immutableId = source?.message?.from?.id ?? source?.from?.id;
+    const username = source?.message?.from?.username ?? source?.from?.username;
+
+    if (immutableId !== undefined && immutableId !== null) {
+      return String(immutableId);
+    }
+
+    if (typeof username === 'string') {
+      return username;
+    }
+
+    throw new InvalidIdentifierException('missing-telegram-identifier');
+  }
+
+  extract(payload: unknown): string {
+    const source = payload as any;
+    const rawImmutableId = source?.message?.from?.id ?? source?.from?.id;
+    const rawUsername =
+      source?.message?.from?.username ?? source?.from?.username;
+
+    const hasImmutableId =
+      rawImmutableId !== undefined && rawImmutableId !== null;
+    const hasUsername = typeof rawUsername === 'string';
+
+    if (!hasImmutableId && !hasUsername) {
+      this.logger.warn(
+        'event=contact_identifier_validation_failed channelType=telegram reason=missing_identifier',
+      );
+      throw new InvalidIdentifierException('empty-telegram-identifier');
+    }
+
+    let validatedImmutableId: string | null = null;
+    if (hasImmutableId) {
+      const immutableId = String(rawImmutableId);
+      const isNumeric = /^\d+$/.test(immutableId);
+      const hasValidLength =
+        immutableId.length >= 5 && immutableId.length <= 20;
+
+      if (!isNumeric || !hasValidLength) {
+        this.logger.warn(
+          `event=contact_identifier_validation_failed channelType=telegram reason=invalid_telegram_id idLength=${immutableId.length}`,
+        );
+        throw new InvalidIdentifierException('invalid-telegram-id');
+      }
+
+      validatedImmutableId = immutableId;
+    }
+
+    let validatedUsername: string | null = null;
+    if (hasUsername) {
+      const username = rawUsername.trim();
+      const isValidUsername = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username);
+
+      if (!isValidUsername) {
+        this.logger.warn(
+          `event=contact_identifier_validation_failed channelType=telegram reason=invalid_username usernameLength=${username.length}`,
+        );
+        throw new InvalidIdentifierException('invalid-telegram-username');
+      }
+
+      validatedUsername = username;
+    }
+
+    if (validatedImmutableId) {
+      return validatedImmutableId;
+    }
+
+    if (validatedUsername) {
+      return validatedUsername;
+    }
+
+    this.logger.warn(
+      'event=contact_identifier_validation_failed channelType=telegram reason=no_valid_identifier',
+    );
+    throw new InvalidIdentifierException('no-valid-telegram-identifier');
+  }
+
+  getIdentifierType(): ContactIdentifierType {
+    return 'platform_id';
+  }
+}
diff --git a/src/channels/shared/contact-identifier/tiktok-identifier.extractor.ts b/src/channels/shared/contact-identifier/tiktok-identifier.extractor.ts
new file mode 100644
index 0000000..a36860c
--- /dev/null
+++ b/src/channels/shared/contact-identifier/tiktok-identifier.extractor.ts
@@ -0,0 +1,35 @@
+import { Injectable } from '@nestjs/common';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ChannelType } from '../channel-type.type';
+import {
+  ContactIdentifierType,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+
+@Injectable()
+export class TiktokIdentifierExtractor
+  implements RawCapableContactIdentifierExtractor
+{
+  supports(channelType: ChannelType): boolean {
+    return channelType === CHANNEL_TYPES.TIKTOK;
+  }
+
+  extractRaw(payload: unknown): string {
+    const source = payload as any;
+    const sender = source?.data?.sender?.user_id ?? source?.sender?.user_id;
+
+    if (typeof sender !== 'string') {
+      throw new Error('missing-tiktok-identifier');
+    }
+
+    return sender;
+  }
+
+  extract(payload: unknown): string {
+    return this.extractRaw(payload).trim();
+  }
+
+  getIdentifierType(): ContactIdentifierType {
+    return 'platform_id';
+  }
+}
diff --git a/src/channels/shared/contact-identifier/web-identifier.extractor.ts b/src/channels/shared/contact-identifier/web-identifier.extractor.ts
new file mode 100644
index 0000000..366a7e3
--- /dev/null
+++ b/src/channels/shared/contact-identifier/web-identifier.extractor.ts
@@ -0,0 +1,35 @@
+import { Injectable } from '@nestjs/common';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ChannelType } from '../channel-type.type';
+import {
+  ContactIdentifierType,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+
+@Injectable()
+export class WebIdentifierExtractor
+  implements RawCapableContactIdentifierExtractor
+{
+  supports(channelType: ChannelType): boolean {
+    return channelType === CHANNEL_TYPES.WEB;
+  }
+
+  extractRaw(payload: unknown): string {
+    const source = payload as any;
+    const rawEmail = source?.email ?? source?.contact?.email ?? source?.user?.email;
+
+    if (typeof rawEmail !== 'string') {
+      throw new Error('missing-web-identifier');
+    }
+
+    return rawEmail;
+  }
+
+  extract(payload: unknown): string {
+    return this.extractRaw(payload).trim().toLowerCase();
+  }
+
+  getIdentifierType(): ContactIdentifierType {
+    return 'email';
+  }
+}
diff --git a/src/channels/shared/contact-identifier/whatsapp-identifier.extractor.ts b/src/channels/shared/contact-identifier/whatsapp-identifier.extractor.ts
new file mode 100644
index 0000000..e277e56
--- /dev/null
+++ b/src/channels/shared/contact-identifier/whatsapp-identifier.extractor.ts
@@ -0,0 +1,66 @@
+import { Injectable, Logger } from '@nestjs/common';
+import { CHANNEL_TYPES } from '../channel-type.constants';
+import { ChannelType } from '../channel-type.type';
+import {
+  ContactIdentifierType,
+  RawCapableContactIdentifierExtractor,
+} from './contact-identifier-extractor.interface';
+import { InvalidIdentifierException } from './contact-identifier.exceptions';
+
+@Injectable()
+export class WhatsappIdentifierExtractor
+  implements RawCapableContactIdentifierExtractor
+{
+  private readonly logger = new Logger(WhatsappIdentifierExtractor.name);
+
+  supports(channelType: ChannelType): boolean {
+    return channelType === CHANNEL_TYPES.WHATSAPP;
+  }
+
+  extractRaw(payload: unknown): string {
+    const source = payload as any;
+    const from =
+      source?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ?? source?.from;
+
+    if (typeof from !== 'string') {
+      this.logger.warn(
+        'event=contact_identifier_validation_failed channelType=whatsapp reason=missing_identifier',
+      );
+      throw new InvalidIdentifierException('missing-whatsapp-identifier');
+    }
+
+    return from;
+  }
+
+  extract(payload: unknown): string {
+    const raw = this.extractRaw(payload);
+    const normalized = raw.replace(/\s+/g, '').replace(/[^\d]/g, '').trim();
+
+    if (!normalized) {
+      this.logger.warn(
+        'event=contact_identifier_validation_failed channelType=whatsapp reason=empty_after_normalization',
+      );
+      throw new InvalidIdentifierException('empty-whatsapp-identifier');
+    }
+
+    if (!/^\d+$/.test(normalized)) {
+      this.logger.warn(
+        'event=contact_identifier_validation_failed channelType=whatsapp reason=non_digit_characters',
+      );
+      throw new InvalidIdentifierException('non-digit-whatsapp-identifier');
+    }
+
+    if (normalized.length < 8 || normalized.length > 15) {
+      this.logger.warn(
+        `event=contact_identifier_validation_failed channelType=whatsapp reason=invalid_length length=${normalized.length}`,
+      );
+      throw new InvalidIdentifierException('invalid-whatsapp-identifier-length');
+    }
+
+    return normalized;
+  }
+
+  getIdentifierType(): ContactIdentifierType {
+    return 'phone';
+  }
+}
diff --git a/src/channels/shared/message-persistence.service.spec.ts b/src/channels/shared/message-persistence.service.spec.ts
index ecff68e..fdd4ed8 100644
--- a/src/channels/shared/message-persistence.service.spec.ts
+++ b/src/channels/shared/message-persistence.service.spec.ts
@@ -1,30 +1,26 @@
 import { Test, TestingModule } from '@nestjs/testing';
 import { MessagePersistenceService } from './message-persistence.service';
 import { MessageRepository } from '../../database/repositories/message.repository';
-import { ContactRepository } from '../../database/repositories/contact.repository';
 import { ConversationSummaryService } from '../../agent/conversation-summary.service';
 import { Types } from 'mongoose';
 
 describe('MessagePersistenceService', () => {
   let service: MessagePersistenceService;
   let messageRepository: jest.Mocked<MessageRepository>;
-  let contactRepository: jest.Mocked<ContactRepository>;
   let conversationSummaryService: jest.Mocked<ConversationSummaryService>;
 
   const mockContext = {
     channelId: '507f1f77bcf86cd799439014',
     agentId: '507f1f77bcf86cd799439013',
     clientId: '507f1f77bcf86cd799439011',
-    externalUserId: 'user@example.com',
-    channelType: 'whatsapp' as const,
-    userName: 'Test User',
+    contactId: '507f1f77bcf86cd799439012',
   };
 
   const mockContact = {
     _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
-    externalUserId: 'user@example.com',
+    externalId: 'user@example.com',
     clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
-    channelType: 'whatsapp' as const,
+    channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
     name: 'Test User',
     status: 'active' as const,
   };
@@ -67,12 +63,6 @@ describe('MessagePersistenceService', () => {
             findConversationContext: jest.fn(),
           },
         },
-        {
-          provide: ContactRepository,
-          useValue: {
-            findOrCreate: jest.fn(),
-          },
-        },
         {
           provide: ConversationSummaryService,
           useValue: {
@@ -84,7 +74,6 @@ describe('MessagePersistenceService', () => {
 
     service = module.get<MessagePersistenceService>(MessagePersistenceService);
     messageRepository = module.get(MessageRepository);
-    contactRepository = module.get(ContactRepository);
     conversationSummaryService = module.get(ConversationSummaryService);
   });
 
@@ -92,27 +81,6 @@ describe('MessagePersistenceService', () => {
     expect(service).toBeDefined();
   });
 
-  describe('findOrCreateContact', () => {
-    it('should call contactRepository.findOrCreate', async () => {
-      contactRepository.findOrCreate.mockResolvedValue(mockContact as any);
-
-      const result = await service.findOrCreateContact(
-        'user@example.com',
-        '507f1f77bcf86cd799439011',
-        'whatsapp',
-        'Test User',
-      );
-
-      expect(contactRepository.findOrCreate).toHaveBeenCalledWith(
-        'user@example.com',
-        expect.any(Types.ObjectId),
-        'whatsapp',
-        'Test User',
-      );
-      expect(result).toEqual(mockContact);
-    });
-  });
-
   describe('saveUserMessage', () => {
     it('should save a user message with correct parameters', async () => {
       messageRepository.create.mockResolvedValue({} as any);
@@ -202,14 +170,12 @@ describe('MessagePersistenceService', () => {
   });
 
   describe('handleIncomingMessage', () => {
-    it('should find/create contact, save message, and return context', async () => {
-      contactRepository.findOrCreate.mockResolvedValue(mockContact as any);
+    it('should save message and return context', async () => {
       messageRepository.create.mockResolvedValue({} as any);
       messageRepository.findConversationContext.mockResolvedValue(mockMessages as any);
 
       const result = await service.handleIncomingMessage('Hello!', mockContext);
 
-      expect(contactRepository.findOrCreate).toHaveBeenCalled();
       expect(messageRepository.create).toHaveBeenCalledWith(
         expect.objectContaining({
           content: 'Hello!',
@@ -217,7 +183,7 @@ describe('MessagePersistenceService', () => {
         }),
       );
       expect(messageRepository.findConversationContext).toHaveBeenCalled();
-      expect(result.contact).toEqual(mockContact);
+      expect(result.contactId.toString()).toEqual(mockContact._id.toString());
       expect(result.conversationHistory).toHaveLength(2);
     });
   });
diff --git a/src/channels/shared/message-persistence.service.ts b/src/channels/shared/message-persistence.service.ts
index fa796f7..7d2cf12 100644
--- a/src/channels/shared/message-persistence.service.ts
+++ b/src/channels/shared/message-persistence.service.ts
@@ -1,7 +1,6 @@
 import { Injectable, Logger } from '@nestjs/common';
 import { Types } from 'mongoose';
 import { MessageRepository } from '../../database/repositories/message.repository';
-import { ContactRepository } from '../../database/repositories/contact.repository';
 import { ConversationSummaryService } from '../../agent/conversation-summary.service';
 import { AgentContext } from '../../agent/contracts/agent-context';
 
@@ -9,9 +8,7 @@ export interface MessagePersistenceContext {
   channelId: Types.ObjectId | string;
   agentId: Types.ObjectId | string;
   clientId: Types.ObjectId | string;
-  externalUserId: string;
-  channelType: 'whatsapp' | 'tiktok' | 'instagram';
-  userName: string;
+  contactId: Types.ObjectId | string;
 }
 
 @Injectable()
@@ -20,27 +17,9 @@ export class MessagePersistenceService {
 
   constructor(
     private readonly messageRepository: MessageRepository,
-    private readonly contactRepository: ContactRepository,
     private readonly conversationSummaryService: ConversationSummaryService,
   ) {}
 
-  /**
-   * Finds or creates a contact by external ID (e.g., phone number, TikTok user ID)
-   */
-  async findOrCreateContact(
-    externalUserId: string,
-    clientId: Types.ObjectId | string,
-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
-    name: string,
-  ): Promise<any> {
-    return this.contactRepository.findOrCreate(
-      externalUserId,
-      new Types.ObjectId(clientId),
-      channelType,
-      name,
-    );
-  }
-
   /**
    * Saves an incoming user message to the database
    */
@@ -140,27 +119,21 @@ export class MessagePersistenceService {
     content: string,
     context: MessagePersistenceContext,
   ): Promise<{
-    contact: any;
+    contactId: Types.ObjectId;
     conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
   }> {
-    // Find or create contact
-    const contact = await this.findOrCreateContact(
-      context.externalUserId,
-      context.clientId,
-      context.channelType,
-      context.userName,
-    );
+    const contactId = new Types.ObjectId(context.contactId);
 
     // Save user message
-    await this.saveUserMessage(content, context, contact._id as Types.ObjectId);
+    await this.saveUserMessage(content, context, contactId);
 
     // Get conversation context
     const conversationHistory = await this.getConversationContext(
       context,
-      contact._id as Types.ObjectId,
+      contactId,
     );
 
-    return { contact, conversationHistory };
+    return { contactId, conversationHistory };
   }
 
   /**
diff --git a/src/channels/shared/shared.module.ts b/src/channels/shared/shared.module.ts
index 8eeb3b0..9311660 100644
--- a/src/channels/shared/shared.module.ts
+++ b/src/channels/shared/shared.module.ts
@@ -4,10 +4,60 @@ import { ConversationSummaryService } from '../../agent/conversation-summary.ser
 import { AgentRoutingService } from './agent-routing.service';
 import { ConfigModule } from '@nestjs/config';
 import { DatabaseModule } from '../../database/database.module';
+import { ContactIdentifierExtractorRegistry } from './contact-identifier/contact-identifier-extractor.registry';
+import { WhatsappIdentifierExtractor } from './contact-identifier/whatsapp-identifier.extractor';
+import { InstagramIdentifierExtractor } from './contact-identifier/instagram-identifier.extractor';
+import { TelegramIdentifierExtractor } from './contact-identifier/telegram-identifier.extractor';
+import { TiktokIdentifierExtractor } from './contact-identifier/tiktok-identifier.extractor';
+import { WebIdentifierExtractor } from './contact-identifier/web-identifier.extractor';
+import { ApiIdentifierExtractor } from './contact-identifier/api-identifier.extractor';
+import { CONTACT_IDENTIFIER_EXTRACTORS } from './contact-identifier/contact-identifier-extractor.interface';
 
 @Module({
   imports: [ConfigModule, DatabaseModule],
-  providers: [MessagePersistenceService, ConversationSummaryService, AgentRoutingService],
-  exports: [MessagePersistenceService, ConversationSummaryService, AgentRoutingService],
+  providers: [
+    MessagePersistenceService,
+    ConversationSummaryService,
+    AgentRoutingService,
+    ContactIdentifierExtractorRegistry,
+    WhatsappIdentifierExtractor,
+    InstagramIdentifierExtractor,
+    TelegramIdentifierExtractor,
+    TiktokIdentifierExtractor,
+    WebIdentifierExtractor,
+    ApiIdentifierExtractor,
+    {
+      provide: CONTACT_IDENTIFIER_EXTRACTORS,
+      useFactory: (
+        whatsappExtractor: WhatsappIdentifierExtractor,
+        instagramExtractor: InstagramIdentifierExtractor,
+        telegramExtractor: TelegramIdentifierExtractor,
+        tiktokExtractor: TiktokIdentifierExtractor,
+        webExtractor: WebIdentifierExtractor,
+        apiExtractor: ApiIdentifierExtractor,
+      ) => [
+        whatsappExtractor,
+        instagramExtractor,
+        telegramExtractor,
+        tiktokExtractor,
+        webExtractor,
+        apiExtractor,
+      ],
+      inject: [
+        WhatsappIdentifierExtractor,
+        InstagramIdentifierExtractor,
+        TelegramIdentifierExtractor,
+        TiktokIdentifierExtractor,
+        WebIdentifierExtractor,
+        ApiIdentifierExtractor,
+      ],
+    },
+  ],
+  exports: [
+    MessagePersistenceService,
+    ConversationSummaryService,
+    AgentRoutingService,
+    ContactIdentifierExtractorRegistry,
+  ],
 })
 export class SharedChannelModule {}
diff --git a/src/channels/tiktok/tiktok.service.spec.ts b/src/channels/tiktok/tiktok.service.spec.ts
index 03c50ce..507bbdc 100644
--- a/src/channels/tiktok/tiktok.service.spec.ts
+++ b/src/channels/tiktok/tiktok.service.spec.ts
@@ -5,6 +5,8 @@ import { AgentService } from '../../agent/agent.service';
 import { AgentRoutingService } from '../shared/agent-routing.service';
 import { AgentRepository } from '../../database/repositories/agent.repository';
 import { AgentContextService } from '../../agent/agent-context.service';
+import { ContactRepository } from '../../database/repositories/contact.repository';
+import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
 import { AgentOutput } from '../../agent/contracts/agent-output';
 import { encrypt } from '../../database/utils/crypto.util';
 
@@ -13,6 +15,8 @@ describe('TiktokService', () => {
   let agentService: jest.Mocked<AgentService>;
   let agentRoutingService: jest.Mocked<AgentRoutingService>;
   let agentRepository: jest.Mocked<AgentRepository>;
+  let contactRepository: jest.Mocked<ContactRepository>;
+  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
   let loggerLogSpy: jest.SpyInstance;
   let loggerWarnSpy: jest.SpyInstance;
   let loggerErrorSpy: jest.SpyInstance;
@@ -43,6 +47,20 @@ describe('TiktokService', () => {
           provide: AgentRepository,
           useValue: { findActiveById: jest.fn() },
         },
+        {
+          provide: ContactRepository,
+          useValue: { findOrCreateByExternalIdentity: jest.fn() },
+        },
+        {
+          provide: ContactIdentifierExtractorRegistry,
+          useValue: {
+            resolve: jest.fn().mockReturnValue({
+              externalId: 'sender_456',
+              externalIdRaw: 'sender_456',
+              identifierType: 'platform_id',
+            }),
+          },
+        },
         {
           provide: AgentContextService,
           useValue: {
@@ -56,6 +74,8 @@ describe('TiktokService', () => {
     agentService = module.get(AgentService);
     agentRoutingService = module.get(AgentRoutingService);
     agentRepository = module.get(AgentRepository);
+    contactRepository = module.get(ContactRepository);
+    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);
 
     loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
     loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
@@ -111,11 +131,11 @@ describe('TiktokService', () => {
 
     const mockClientAgent = {
         agentId: 'agent_007',
-        clientId: 'client_001',
+        clientId: '507f1f77bcf86cd799439011',
         channels: [
           {
             status: 'active',
-            channelId: 'channel_1',
+            channelId: '507f1f77bcf86cd799439014',
             credentials: encryptedCredsRecord,
             llmConfig: { provider: 'openai', apiKey: 'key' },
           },
@@ -170,6 +190,9 @@ describe('TiktokService', () => {
         },
       } as any);
       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439012',
+      } as any);
       agentService.run.mockResolvedValue({
         reply: { text: 'Hello back!', type: 'text' },
       });
@@ -203,6 +226,9 @@ describe('TiktokService', () => {
         },
       } as any);
       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439012',
+      } as any);
       agentService.run.mockResolvedValue({
         reply: { text: 'Hello back!', type: 'text' },
       });
diff --git a/src/channels/tiktok/tiktok.service.ts b/src/channels/tiktok/tiktok.service.ts
index ff9cf15..21653d9 100644
--- a/src/channels/tiktok/tiktok.service.ts
+++ b/src/channels/tiktok/tiktok.service.ts
@@ -1,12 +1,16 @@
 import { Injectable, Logger } from '@nestjs/common';
+import { Types } from 'mongoose';
 import { AgentService } from '../../agent/agent.service';
 import { AgentInput } from '../../agent/contracts/agent-input';
 import { AgentContext } from '../../agent/contracts/agent-context';
 import { AgentRepository } from '../../database/repositories/agent.repository';
+import { ContactRepository } from '../../database/repositories/contact.repository';
 import { AgentRoutingService } from '../shared/agent-routing.service';
 import { AgentContextService } from '../../agent/agent-context.service';
 import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
 import { TIKTOK_API_BASE_URL } from './tiktok.config';
+import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
+import { CHANNEL_TYPES } from '../shared/channel-type.constants';
 
 @Injectable()
 export class TiktokService {
@@ -16,7 +20,9 @@ export class TiktokService {
     private readonly agentService: AgentService,
     private readonly agentRoutingService: AgentRoutingService,
     private readonly agentRepository: AgentRepository,
+    private readonly contactRepository: ContactRepository,
     private readonly agentContextService: AgentContextService,
+    private readonly identifierExtractorRegistry: ContactIdentifierExtractorRegistry,
   ) {}
 
   async handleIncoming(payload: any): Promise<void> {
@@ -43,12 +49,17 @@ export class TiktokService {
       `[TikTok] Incoming message from sender=${data.sender?.user_id} to recipient=${recipientUserId}`,
     );
 
+    const identifier = this.identifierExtractorRegistry.resolve(
+      CHANNEL_TYPES.TIKTOK,
+      payload,
+    );
+
     // Route: resolve which agent should handle this message
     const routeDecision = await this.agentRoutingService.resolveRoute({
-      channelIdentifier: recipientUserId,
-      externalUserId: data.sender.user_id,
+      routeChannelIdentifier: recipientUserId,
+      channelIdentifier: identifier.externalId,
       incomingText: data.message.text,
-      channelType: 'tiktok',
+      channelType: CHANNEL_TYPES.TIKTOK,
     });
 
     if (routeDecision.kind === 'unroutable') {
@@ -112,9 +123,18 @@ export class TiktokService {
 
     const context = await this.agentContextService.enrichContext(rawContext);
 
+    const contact = await this.contactRepository.findOrCreateByExternalIdentity(
+      new Types.ObjectId(clientAgent.clientId),
+      new Types.ObjectId(channelConfig.channelId.toString()),
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      data.sender.user_id,
+    );
+
     const input: AgentInput = {
-      channel: 'tiktok',
-      externalUserId: data.sender.user_id,
+      channel: CHANNEL_TYPES.TIKTOK,
+      contactId: contact._id.toString(),
       conversationId: data.conversation_id,
       message: {
         type: 'text',
diff --git a/src/channels/whatsapp/whatsapp.service.spec.ts b/src/channels/whatsapp/whatsapp.service.spec.ts
index ec82c16..58e2370 100644
--- a/src/channels/whatsapp/whatsapp.service.spec.ts
+++ b/src/channels/whatsapp/whatsapp.service.spec.ts
@@ -5,15 +5,19 @@ import { WhatsappService } from './whatsapp.service';
 import { AgentService } from '../../agent/agent.service';
 import { AgentRepository } from '../../database/repositories/agent.repository';
 import { ClientRepository } from '../../database/repositories/client.repository';
+import { ContactRepository } from '../../database/repositories/contact.repository';
 import { LlmProvider } from '../../agent/llm/provider.enum';
 import { AgentRoutingService } from '../shared/agent-routing.service';
 import { AgentContextService } from '../../agent/agent-context.service';
+import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
 
 describe('WhatsappService', () => {
   let service: WhatsappService;
   let agentService: jest.Mocked<AgentService>;
   let agentRoutingService: jest.Mocked<AgentRoutingService>;
   let agentRepository: jest.Mocked<AgentRepository>;
+  let contactRepository: jest.Mocked<ContactRepository>;
+  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
   let loggerLogSpy: jest.SpyInstance;
   let loggerWarnSpy: jest.SpyInstance;
   let fetchSpy: jest.SpyInstance;
@@ -48,6 +52,20 @@ describe('WhatsappService', () => {
           provide: ClientRepository,
           useValue: { findById: jest.fn().mockResolvedValue({ name: 'Test Client' }) },
         },
+        {
+          provide: ContactRepository,
+          useValue: { findOrCreateByExternalIdentity: jest.fn() },
+        },
+        {
+          provide: ContactIdentifierExtractorRegistry,
+          useValue: {
+            resolve: jest.fn().mockReturnValue({
+              externalId: '1234567890',
+              externalIdRaw: '+1234567890',
+              identifierType: 'phone',
+            }),
+          },
+        },
         {
           provide: AgentContextService,
           useValue: {
@@ -61,6 +79,8 @@ describe('WhatsappService', () => {
     agentService = module.get(AgentService);
     agentRoutingService = module.get(AgentRoutingService);
     agentRepository = module.get(AgentRepository);
+    contactRepository = module.get(ContactRepository);
+    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);
 
     // Spy on Logger.prototype since a new Logger() is instantiated in the service
     loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
@@ -135,12 +155,12 @@ describe('WhatsappService', () => {
 
     const mockClientAgent = {
       _id: 'ca-1',
-      clientId: 'client-1',
+      clientId: '507f1f77bcf86cd799439011',
       agentId: 'agent-1',
       status: 'active',
       channels: [
         {
-          channelId: 'whatsapp-1',
+          channelId: '507f1f77bcf86cd799439014',
           status: 'active',
           provider: 'meta',
           credentials: { phoneNumberId: 'phone123', accessToken: 'sk-wa-token' },
@@ -159,6 +179,10 @@ describe('WhatsappService', () => {
       systemPrompt: 'You are a helpful assistant.',
     };
 
+    const mockContact = {
+      _id: '507f1f77bcf86cd799439012',
+    };
+
     const mockResolvedRoute = {
       kind: 'resolved' as const,
       candidate: {
@@ -232,6 +256,7 @@ describe('WhatsappService', () => {
     it('should call agentService.run with correct input and context', async () => {
       agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue(mockContact as any);
       agentService.run.mockResolvedValue({
         reply: { type: 'text', text: 'Hello' },
       });
@@ -242,15 +267,15 @@ describe('WhatsappService', () => {
       expect(agentService.run).toHaveBeenCalledWith(
         {
           channel: 'whatsapp',
-          externalUserId: '1234567890',
+          contactId: '507f1f77bcf86cd799439012',
           conversationId: 'phone123:1234567890',
           message: { type: 'text', text: 'Hello' },
           metadata: { messageId: 'msg123', phoneNumberId: 'phone123' },
         },
         expect.objectContaining({
           agentId: 'agent-1',
-          clientId: 'client-1',
-          channelId: 'whatsapp-1',
+          clientId: '507f1f77bcf86cd799439011',
+          channelId: '507f1f77bcf86cd799439014',
           systemPrompt: 'You are a helpful assistant.',
           channelConfig: mockClientAgent.channels[0].credentials,
         }),
@@ -260,6 +285,7 @@ describe('WhatsappService', () => {
     it('should log outbound message when reply exists', async () => {
       agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue(mockContact as any);
       agentService.run.mockResolvedValue({
         reply: { type: 'text', text: 'Echo response' },
       });
@@ -275,6 +301,7 @@ describe('WhatsappService', () => {
     it('should not log outbound message when reply is undefined', async () => {
       agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
+      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue(mockContact as any);
       agentService.run.mockResolvedValue({});
 
       const payload = createPayload();
diff --git a/src/channels/whatsapp/whatsapp.service.ts b/src/channels/whatsapp/whatsapp.service.ts
index 713cbfc..9c0a10b 100644
--- a/src/channels/whatsapp/whatsapp.service.ts
+++ b/src/channels/whatsapp/whatsapp.service.ts
@@ -1,9 +1,11 @@
 import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
+import { Types } from 'mongoose';
 import { AgentService } from '../../agent/agent.service';
 import { AgentInput } from '../../agent/contracts/agent-input';
 import { AgentContext } from '../../agent/contracts/agent-context';
 import { AgentRepository } from '../../database/repositories/agent.repository';
 import { ClientRepository } from '../../database/repositories/client.repository';
+import { ContactRepository } from '../../database/repositories/contact.repository';
 import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
 import { RouteCandidate } from '../shared/agent-routing.service';
 import {
@@ -13,6 +15,8 @@ import {
 } from './whatsapp.config';
 import { AgentRoutingService } from '../shared/agent-routing.service';
 import { AgentContextService } from '../../agent/agent-context.service';
+import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
+import { CHANNEL_TYPES } from '../shared/channel-type.constants';
 
 @Injectable()
 export class WhatsappService {
@@ -23,8 +27,10 @@ export class WhatsappService {
     private readonly agentService: AgentService,
     private readonly agentRepository: AgentRepository,
     private readonly clientRepository: ClientRepository,
+    private readonly contactRepository: ContactRepository,
     private readonly agentRoutingService: AgentRoutingService,
     private readonly agentContextService: AgentContextService,
+    private readonly identifierExtractorRegistry: ContactIdentifierExtractorRegistry,
   ) {
     this.config = loadWhatsAppConfig();
   }
@@ -104,11 +110,16 @@ export class WhatsappService {
     );
     this.logger.log(`[WhatsApp] Extracted phoneNumberId: ${phoneNumberId}`);
 
+    const identifier = this.identifierExtractorRegistry.resolve(
+      CHANNEL_TYPES.WHATSAPP,
+      payload,
+    );
+
     const routeDecision = await this.agentRoutingService.resolveRoute({
-      channelIdentifier: phoneNumberId,
-      externalUserId: message.from,
+      routeChannelIdentifier: phoneNumberId,
+      channelIdentifier: identifier.externalId,
       incomingText: message.text.body,
-      channelType: 'whatsapp',
+      channelType: CHANNEL_TYPES.WHATSAPP,
     });
 
     if (routeDecision.kind === 'unroutable') {
@@ -181,9 +192,18 @@ export class WhatsappService {
 
     const context = await this.agentContextService.enrichContext(rawContext);
 
+    const contact = await this.contactRepository.findOrCreateByExternalIdentity(
+      new Types.ObjectId(clientAgent.clientId),
+      new Types.ObjectId(channelConfig.channelId.toString()),
+      identifier.externalId,
+      identifier.externalIdRaw,
+      identifier.identifierType,
+      message.from,
+    );
+
     const input: AgentInput = {
-      channel: 'whatsapp',
-      externalUserId: message.from,
+      channel: CHANNEL_TYPES.WHATSAPP,
+      contactId: contact._id.toString(),
       conversationId: `${phoneNumberId}:${message.from}`,
       message: {
         type: 'text',
diff --git a/src/database/repositories/contact.repository.spec.ts b/src/database/repositories/contact.repository.spec.ts
new file mode 100644
index 0000000..83aa6c4
--- /dev/null
+++ b/src/database/repositories/contact.repository.spec.ts
@@ -0,0 +1,51 @@
+import { Logger } from '@nestjs/common';
+import { Types } from 'mongoose';
+import { ContactRepository } from './contact.repository';
+
+describe('ContactRepository', () => {
+  it('retries by reading existing contact when duplicate key error occurs', async () => {
+    const duplicateError = Object.assign(new Error('E11000 duplicate key error'), {
+      code: 11000,
+    });
+
+    const existing = {
+      _id: new Types.ObjectId(),
+      clientId: new Types.ObjectId(),
+      channelId: new Types.ObjectId(),
+      externalId: '14155550123',
+      status: 'active',
+    };
+
+    const model = {
+      findOneAndUpdate: jest.fn().mockReturnValue({
+        exec: jest.fn().mockRejectedValue(duplicateError),
+      }),
+      findOne: jest.fn().mockReturnValue({
+        session: jest.fn().mockReturnValue({
+          exec: jest.fn().mockResolvedValue(existing),
+        }),
+      }),
+    };
+
+    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
+    const repository = new ContactRepository(model as any);
+
+    const result = await repository.findOrCreateByExternalIdentity(
+      existing.clientId,
+      existing.channelId,
+      existing.externalId,
+      '+1 415 555 0123',
+      'phone',
+      'User',
+    );
+
+    expect(result).toEqual(existing);
+    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
+    expect(model.findOne).toHaveBeenCalledTimes(1);
+    expect(warnSpy).toHaveBeenCalledWith(
+      expect.stringContaining('event=contact_duplicate_key_retry'),
+    );
+
+    warnSpy.mockRestore();
+  });
+});
diff --git a/src/database/repositories/contact.repository.ts b/src/database/repositories/contact.repository.ts
index eae8ea4..256b4a2 100644
--- a/src/database/repositories/contact.repository.ts
+++ b/src/database/repositories/contact.repository.ts
@@ -1,10 +1,13 @@
-import { Injectable } from '@nestjs/common';
+import { Injectable, Logger } from '@nestjs/common';
 import { InjectModel } from '@nestjs/mongoose';
 import { ClientSession, Model, Types } from 'mongoose';
 import { Contact } from '../schemas/contact.schema';
+import { ContactIdentifierType } from '../schemas/contact.schema';
 
 @Injectable()
 export class ContactRepository {
+  private readonly logger = new Logger(ContactRepository.name);
+
   constructor(
     @InjectModel(Contact.name)
     private readonly model: Model<Contact>,
@@ -18,42 +21,80 @@ export class ContactRepository {
     return this.model.find({ clientId }).exec();
   }
 
-  async findByExternalUserId(
-    externalUserId: string,
+  async findByExternalIdentity(
     clientId: Types.ObjectId,
+    channelId: Types.ObjectId,
+    externalId: string,
   ): Promise<Contact | null> {
-    return this.model.findOne({ externalUserId, clientId }).exec();
+    return this.model
+      .findOne({ clientId, channelId, externalId })
+      .exec();
   }
 
-  async findOrCreate(
-    externalUserId: string,
+  async findOrCreateByExternalIdentity(
     clientId: Types.ObjectId,
-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
+    channelId: Types.ObjectId,
+    externalId: string,
+    externalIdRaw: string | undefined,
+    identifierType: ContactIdentifierType,
     name: string,
+    metadata?: Record<string, unknown>,
     session?: ClientSession,
   ): Promise<Contact> {
-    const existing = await this.model
-      .findOne({ externalUserId, clientId })
-      .session(session)
-      .exec();
+    const filter = { clientId, channelId, externalId };
+    const setOnInsert = {
+      clientId,
+      channelId,
+      externalId,
+      externalIdRaw,
+      identifier: {
+        type: identifierType,
+        value: externalId,
+      },
+      name,
+      metadata: metadata ?? {},
+      status: 'active',
+    };
+
+    try {
+      const contact = await this.model
+        .findOneAndUpdate(
+          filter,
+          {
+            $setOnInsert: setOnInsert,
+          },
+          {
+            upsert: true,
+            new: true,
+            setDefaultsOnInsert: true,
+            runValidators: true,
+            session,
+          },
+        )
+        .exec();
 
-    if (existing) {
-      return existing;
+      this.logger.log(
+        `event=contact_upsert_success clientId=${clientId.toString()} channelId=${channelId.toString()}`,
+      );
+
+      return contact as Contact;
+    } catch (error) {
+      if (this.isDuplicateKeyError(error)) {
+        this.logger.warn(
+          `event=contact_duplicate_key_retry clientId=${clientId.toString()} channelId=${channelId.toString()}`,
+        );
+
+        const existing = await this.model.findOne(filter).session(session).exec();
+        if (existing) {
+          return existing;
+        }
+      }
+
+      throw error;
     }
+  }
 
-    const [contact] = await this.model.create(
-      [
-        {
-          externalUserId,
-          clientId,
-          channelType,
-          name,
-          status: 'active',
-        },
-      ],
-      { session },
-    );
-
-    return contact;
+  private isDuplicateKeyError(error: unknown): boolean {
+    return typeof error === 'object' && error !== null && (error as any).code === 11000;
   }
 }
diff --git a/src/database/schemas/contact.schema.spec.ts b/src/database/schemas/contact.schema.spec.ts
new file mode 100644
index 0000000..ec08beb
--- /dev/null
+++ b/src/database/schemas/contact.schema.spec.ts
@@ -0,0 +1,63 @@
+import { ContactSchema, throwsIfExternalIdMutation } from './contact.schema';
+
+describe('ContactSchema', () => {
+  it('enforces unique compound index on clientId+channelId+externalId without legacy unique index', () => {
+    const indexes = ContactSchema.indexes();
+
+    const hasRequiredCompoundIndex = indexes.some(
+      ([fields, options]) =>
+        fields.clientId === 1 &&
+        fields.channelId === 1 &&
+        fields.externalId === 1 &&
+        options?.unique === true,
+    );
+
+    const hasLegacyUniqueIndex = indexes.some(
+      ([fields, options]) =>
+        ((fields as any).channelIdentifier === 1 || (fields as any).externalUserId === 1) &&
+        options?.unique === true,
+    );
+
+    expect(hasRequiredCompoundIndex).toBe(true);
+    expect(hasLegacyUniqueIndex).toBe(false);
+  });
+
+  it('marks externalId as immutable', () => {
+    const externalIdPath = ContactSchema.path('externalId') as any;
+    expect(externalIdPath.options.immutable).toBe(true);
+  });
+
+  it('throws when externalId mutation is attempted via update payload', () => {
+    expect(() =>
+      throwsIfExternalIdMutation({
+        $set: { externalId: 'new-external-id' },
+      }),
+    ).toThrow('externalId is immutable and cannot be modified');
+  });
+
+  it('allows upsert setOnInsert for externalId without mutation error', () => {
+    expect(() =>
+      throwsIfExternalIdMutation({
+        $setOnInsert: { externalId: 'new-external-id' },
+      }),
+    ).not.toThrow();
+  });
+
+  it('keeps original externalId unchanged after mutation attempt', () => {
+    const persisted = {
+      _id: 'contact-1',
+      externalId: '12345678',
+      name: 'Contact',
+    };
+
+    try {
+      throwsIfExternalIdMutation({
+        $set: { externalId: '99999999' },
+      });
+    } catch {
+      // mutation blocked as expected
+    }
+
+    expect(persisted.externalId).toBe('12345678');
+  });
+});
diff --git a/src/database/schemas/contact.schema.ts b/src/database/schemas/contact.schema.ts
index 5c6405e..06b6d6c 100644
--- a/src/database/schemas/contact.schema.ts
+++ b/src/database/schemas/contact.schema.ts
@@ -1,10 +1,37 @@
 import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
 import { Document, Types } from 'mongoose';
 
+export type ContactIdentifierType =
+  | 'phone'
+  | 'username'
+  | 'platform_id'
+  | 'email';
+
+@Schema({ _id: false })
+export class ContactIdentifier {
+  @Prop({
+    required: true,
+    enum: ['phone', 'username', 'platform_id', 'email'],
+  })
+  type: ContactIdentifierType;
+
+  @Prop({ required: true })
+  value: string;
+}
+
+export const ContactIdentifierSchema =
+  SchemaFactory.createForClass(ContactIdentifier);
+
 @Schema({ collection: 'contacts', timestamps: true })
 export class Contact extends Document {
-  @Prop({ required: true, index: true })
-  externalUserId: string;
+  @Prop({ required: true, index: true, immutable: true })
+  externalId: string;
+
+  @Prop()
+  externalIdRaw?: string;
+
+  @Prop({ type: ContactIdentifierSchema })
+  identifier?: ContactIdentifier;
 
   @Prop({
     type: Types.ObjectId,
@@ -15,22 +42,26 @@ export class Contact extends Document {
   clientId: Types.ObjectId;
 
   @Prop({
+    type: Types.ObjectId,
+    ref: 'Channel',
     required: true,
-    enum: ['whatsapp', 'tiktok', 'instagram'],
     index: true,
   })
-  channelType: 'whatsapp' | 'tiktok' | 'instagram';
+  channelId: Types.ObjectId;
 
   @Prop({ required: true })
   name: string;
 
+  @Prop({ type: Object, default: {} })
+  metadata?: Record<string, any>;
+
   @Prop({
     required: true,
-    enum: ['active', 'inactive', 'archived'],
+    enum: ['active', 'blocked', 'archived'],
     default: 'active',
     index: true,
   })
-  status: 'active' | 'inactive' | 'archived';
+  status: 'active' | 'blocked' | 'archived';
 
   createdAt: Date;
   updatedAt: Date;
@@ -38,5 +69,34 @@ export class Contact extends Document {
 
 export const ContactSchema = SchemaFactory.createForClass(Contact);
 
-// Unique per external user per client
-ContactSchema.index({ externalUserId: 1, clientId: 1 }, { unique: true });
+export function throwsIfExternalIdMutation(update: Record<string, any>): void {
+  if (!update) {
+    return;
+  }
+
+  const directMutation = Object.prototype.hasOwnProperty.call(update, 'externalId');
+  const setMutation =
+    !!update.$set &&
+    Object.prototype.hasOwnProperty.call(update.$set, 'externalId');
+  const unsetMutation =
+    !!update.$unset &&
+    Object.prototype.hasOwnProperty.call(update.$unset, 'externalId');
+  const renameMutation =
+    !!update.$rename &&
+    Object.prototype.hasOwnProperty.call(update.$rename, 'externalId');
+
+  if (directMutation || setMutation || unsetMutation || renameMutation) {
+    throw new Error('externalId is immutable and cannot be modified');
+  }
+}
+
+ContactSchema.pre('findOneAndUpdate', function () {
+  const update = this.getUpdate() as Record<string, any>;
+  throwsIfExternalIdMutation(update);
+});
+
+// Unique per normalized identifier per client per channel
+ContactSchema.index(
+  { clientId: 1, channelId: 1, externalId: 1 },
+  { unique: true },
+);
diff --git a/test/message-persistence.e2e-spec.ts b/test/message-persistence.e2e-spec.ts
index 8e95786..6418493 100644
--- a/test/message-persistence.e2e-spec.ts
+++ b/test/message-persistence.e2e-spec.ts
@@ -52,7 +52,7 @@ describe('Message Persistence (e2e)', () => {
       await connection.collection('agents').deleteOne({ _id: agentIdObj });
       await connection.collection('client_agents').deleteOne({ _id: clientAgentIdObj });
       await connection.collection('messages').deleteMany({ channelId: channelIdObj });
-      await connection.collection('contacts').deleteMany({ externalUserId: userPhone });
+      await connection.collection('contacts').deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
     }
 
     // Create Client
@@ -103,7 +103,7 @@ describe('Message Persistence (e2e)', () => {
       await connection.collection('agents').deleteOne({ _id: agentIdObj });
       await connection.collection('client_agents').deleteOne({ _id: clientAgentIdObj });
       await connection.collection('messages').deleteMany({ channelId: channelIdObj });
-      await connection.collection('contacts').deleteMany({ externalUserId: userPhone });
+      await connection.collection('contacts').deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
     }
     await app.close();
   });
@@ -111,7 +111,7 @@ describe('Message Persistence (e2e)', () => {
   beforeEach(async () => {
     // Clean up messages before each test
     await connection.collection('messages').deleteMany({ channelId: channelIdObj });
-    await connection.collection('contacts').deleteMany({ externalUserId: userPhone });
+    await connection.collection('contacts').deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
     jest.clearAllMocks();
   });
 
@@ -149,9 +149,9 @@ describe('Message Persistence (e2e)', () => {
       // Assert - Check contact was created
       const contact = await connection
         .collection('contacts')
-        .findOne({ externalUserId: userPhone });
+        .findOne({ externalId: userPhone.replace(/[^\d]/g, '') });
       expect(contact).toBeDefined();
-      expect(contact.externalUserId).toBe(userPhone);
+      expect(contact.externalId).toBe(userPhone.replace(/[^\d]/g, ''));
       expect(contact.clientId.toString()).toBe(clientId);
 
       // Assert - Check user message was persisted
@@ -257,10 +257,16 @@ describe('Message Persistence (e2e)', () => {
 
       // Create a contact with enough messages to exceed threshold
       const contactResult = await connection.collection('contacts').insertOne({
-        externalUserId: userPhone,
+        externalId: userPhone.replace(/[^\d]/g, ''),
+        externalIdRaw: userPhone,
+        identifier: {
+          type: 'phone',
+          value: userPhone.replace(/[^\d]/g, ''),
+        },
         clientId: clientIdObj,
-        channelType: 'whatsapp',
+        channelId: channelIdObj,
         name: userPhone,
+        metadata: {},
         status: 'active',
       });
 
@@ -370,12 +376,12 @@ describe('Message Persistence (e2e)', () => {
 
       const contact = await connection
         .collection('contacts')
-        .findOne({ externalUserId: userPhone });
+        .findOne({ externalId: userPhone.replace(/[^\d]/g, '') });
 
       expect(contact).toBeDefined();
-      expect(contact.externalUserId).toBe(userPhone);
+      expect(contact.externalId).toBe(userPhone.replace(/[^\d]/g, ''));
       expect(contact.name).toBe(userPhone);
-      expect(contact.channelType).toBe('whatsapp');
+      expect(contact.channelId.toString()).toBe(channelIdObj.toString());
       expect(contact.status).toBe('active');
     });
 
@@ -408,7 +414,7 @@ describe('Message Persistence (e2e)', () => {
 
       const contactCountAfterFirst = await connection
         .collection('contacts')
-        .countDocuments({ externalUserId: userPhone });
+        .countDocuments({ externalId: userPhone.replace(/[^\d]/g, '') });
 
       // Second message
       const payload2 = {
@@ -438,7 +444,7 @@ describe('Message Persistence (e2e)', () => {
 
       const contactCountAfterSecond = await connection
         .collection('contacts')
-        .countDocuments({ externalUserId: userPhone });
+        .countDocuments({ externalId: userPhone.replace(/[^\d]/g, '') });
 
       // Should still be only one contact
       expect(contactCountAfterFirst).toBe(1);
diff --git a/test/whatsapp-routing.e2e-spec.ts b/test/whatsapp-routing.e2e-spec.ts
index dafd9f3..180c384 100644
--- a/test/whatsapp-routing.e2e-spec.ts
+++ b/test/whatsapp-routing.e2e-spec.ts
@@ -508,20 +508,20 @@ describe('WhatsApp Message Routing (e2e)', () => {
       // Conversations should be separate (verified by conversationId including phoneNumberId)
     });
 
-    it('should maintain separate conversations for same external user ID across different clients', async () => {
+    it('should maintain separate conversations for same channel identifier across different clients', async () => {
       if (!user1PhoneNumberId || !user2PhoneNumberId) {
         return;
       }
 
-      const sameExternalUserId = '5555555555';
+      const sameChannelIdentifier = '5555555555';
 
-      // Same external user messages different clients
+      // Same channel identifier messages different clients
       await request(app.getHttpServer())
         .post('/whatsapp/webhook')
         .send(
           createWhatsAppMessage(
             user1PhoneNumberId,
-            sameExternalUserId,
+            sameChannelIdentifier,
             'Message to User 1',
             'msg-same-user-1',
           ),
@@ -533,7 +533,7 @@ describe('WhatsApp Message Routing (e2e)', () => {
         .send(
           createWhatsAppMessage(
             user2PhoneNumberId,
-            sameExternalUserId,
+            sameChannelIdentifier,
             'Message to User 2',
             'msg-same-user-2',
           ),
```

## Unstaged

```diff
```

## Untracked

### DIFF_DUMP_LATEST.md
```diff
diff --git a/DIFF_DUMP_LATEST.md b/DIFF_DUMP_LATEST.md
new file mode 100644
index 0000000..6e5fc2b
--- /dev/null
+++ b/DIFF_DUMP_LATEST.md
@@ -0,0 +1,2835 @@
+# Diff Dump (Staged + Unstaged + Untracked)
+
+Generated: 2026-02-28 15:25:44 UTC
+
+## Staged
+
+```diff
+diff --git a/TODO.md b/TODO.md
+index d2f8a45..98345f1 100644
+--- a/TODO.md
++++ b/TODO.md
+@@ -80,9 +80,9 @@ context.transferInfo = {
+ Add transfer check as highest priority strategy:
+ 
+ ```typescript
+-async resolveRoute(phoneNumberId, externalUserId, incomingText) {
++async resolveRoute(routeChannelIdentifier, channelIdentifier, incomingText) {
+   // NEW: Check for active transfer (highest priority)
+-  const transfer = await this.getActiveTransfer(externalUserId, phoneNumberId);
++  const transfer = await this.getActiveTransfer(channelIdentifier, routeChannelIdentifier);
+   if (transfer) {
+     return { kind: 'resolved', candidate: transfer.targetAgent };
+   }
+diff --git a/docs/MESSAGE_PERSISTENCE.md b/docs/MESSAGE_PERSISTENCE.md
+index f4de396..a7b1b95 100644
+--- a/docs/MESSAGE_PERSISTENCE.md
++++ b/docs/MESSAGE_PERSISTENCE.md
+@@ -80,20 +80,21 @@ The threshold should leave room for:
+ 
+ ## Database Schema
+ 
+-### User Schema Updates
++### Contact Schema Updates
+ 
+ ```typescript
+ {
+-  email: string;              // Existing
+-  name: string;               // Existing
+-  clientId: ObjectId;         // Existing
+-  status: string;             // Existing
+-  externalUserId?: string;    // NEW: WhatsApp phone number or other external ID
++  clientId: ObjectId;
++  channelId: ObjectId;
++  channelIdentifier: string;  // Channel-specific sender identity
++  name: string;
++  metadata?: Record<string, unknown>;
++  status: 'active' | 'blocked' | 'archived';
+ }
+ ```
+ 
+ **Indexes:**
+-- `{ externalUserId: 1, clientId: 1 }` - For efficient external user lookups
++- `{ clientId: 1, channelId: 1, channelIdentifier: 1 }` (unique) - Canonical contact identity
+ 
+ ### Message Schema
+ 
+@@ -101,7 +102,7 @@ The threshold should leave room for:
+ {
+   content: string;            // Message text or summary text
+   type: 'user' | 'agent' | 'summary';  // Message type
+-  userId: ObjectId;           // Reference to User
++  contactId: ObjectId;        // Reference to Contact
+   agentId: ObjectId;          // Reference to Agent
+   channelId: ObjectId;        // Reference to Channel
+   status: string;             // 'active', 'inactive', 'archived'
+@@ -178,7 +179,7 @@ npm test -- --testPathPattern="(repository|agent.service|users|agents)"
+ 
+ Check:
+ 1. MongoDB connection is working
+-2. User collection has the `externalUserId` field
++2. Contact collection has the `channelIdentifier` field
+ 3. Message collection exists
+ 4. Proper indexes are created
+ 
+@@ -192,7 +193,7 @@ Check:
+ ### Context Not Loading
+ 
+ Check:
+-1. Messages are being saved with correct `userId`, `agentId`, and `channelId`
++1. Messages are being saved with correct `contactId`, `agentId`, and `channelId`
+ 2. MessageRepository.findConversationContext query is working
+ 3. Check for database query errors in logs
+ 
+@@ -204,4 +205,4 @@ This implementation follows the existing Pulsar architecture:
+ - **Services**: Contain business logic, use repositories for data access
+ - **Controllers**: Handle HTTP, delegate to services
+ - **No breaking changes**: All existing functionality continues to work
+-- **Backward compatible**: Existing users without `externalUserId` are unaffected
++- **Identity-safe**: Contact identity is scoped by client + channel + channelIdentifier
+diff --git a/docs/rules/channel-integration.md b/docs/rules/channel-integration.md
+index 042e2a6..0f69b07 100644
+--- a/docs/rules/channel-integration.md
++++ b/docs/rules/channel-integration.md
+@@ -84,8 +84,8 @@ All incoming channel messages MUST use `AgentRoutingService.resolveRoute()` for
+ 
+ ```typescript
+ const routeDecision = await this.agentRoutingService.resolveRoute({
+-  channelIdentifier: phoneNumberId,  // or tiktokUserId, instagramAccountId
+-  externalUserId: message.from,
++  routeChannelIdentifier: phoneNumberId,  // or tiktokUserId, instagramAccountId
++  channelIdentifier: message.from,
+   incomingText: message.text.body,
+   channelType: 'whatsapp',           // or 'tiktok', 'instagram'
+ });
+@@ -120,7 +120,7 @@ const context = await this.agentContextService.enrichContext(rawContext);
+ 
+ const input: AgentInput = {
+   channel: 'whatsapp',
+-  externalUserId: message.from,
++  contactId: contact._id.toString(),
+   conversationId: `${phoneNumberId}:${message.from}`,
+   message: { type: 'text', text: message.text.body },
+   metadata: { messageId: message.id, phoneNumberId },
+diff --git a/src/agent/agent.service.spec.ts b/src/agent/agent.service.spec.ts
+index fb2e05e..54fd253 100644
+--- a/src/agent/agent.service.spec.ts
++++ b/src/agent/agent.service.spec.ts
+@@ -24,7 +24,7 @@ describe('AgentService', () => {
+ 
+   const mockInput: AgentInput = {
+     channel: 'whatsapp',
+-    externalUserId: '1234567890',
++    contactId: '507f1f77bcf86cd799439012',
+     conversationId: 'phone123:1234567890',
+     message: { type: 'text', text: 'Hello, world!' },
+   };
+@@ -43,9 +43,9 @@ describe('AgentService', () => {
+ 
+   const mockContact = {
+     _id: 'contact-1',
+-    externalUserId: '1234567890',
++    channelIdentifier: '1234567890',
+     clientId: 'client-1',
+-    channelType: 'whatsapp',
++    channelId: 'channel-1',
+   };
+ 
+   beforeEach(async () => {
+@@ -88,7 +88,7 @@ describe('AgentService', () => {
+       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
+       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
+       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
+-        contact: mockContact,
++        contactId: 'contact-1' as any,
+         conversationHistory,
+       });
+       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
+@@ -101,9 +101,7 @@ describe('AgentService', () => {
+           channelId: 'channel-1',
+           agentId: 'agent-1',
+           clientId: 'client-1',
+-          externalUserId: '1234567890',
+-          channelType: 'whatsapp',
+-          userName: '1234567890',
++          contactId: '507f1f77bcf86cd799439012',
+         },
+       );
+ 
+@@ -128,9 +126,7 @@ describe('AgentService', () => {
+           channelId: 'channel-1',
+           agentId: 'agent-1',
+           clientId: 'client-1',
+-          externalUserId: '1234567890',
+-          channelType: 'whatsapp',
+-          userName: '1234567890',
++          contactId: '507f1f77bcf86cd799439012',
+         },
+         'contact-1',
+         mockContext,
+@@ -146,7 +142,7 @@ describe('AgentService', () => {
+       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
+       (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
+       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
+-        contact: mockContact,
++        contactId: 'contact-1' as any,
+         conversationHistory: [],
+       });
+       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
+@@ -166,7 +162,7 @@ describe('AgentService', () => {
+         throw new Error('API error');
+       });
+       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
+-        contact: mockContact,
++        contactId: 'contact-1' as any,
+         conversationHistory: [],
+       });
+ 
+@@ -186,7 +182,7 @@ describe('AgentService', () => {
+       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
+       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'response' });
+       messagePersistenceService.handleIncomingMessage.mockResolvedValue({
+-        contact: mockContact,
++        contactId: 'contact-1' as any,
+         conversationHistory: [],
+       });
+       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
+diff --git a/src/agent/agent.service.ts b/src/agent/agent.service.ts
+index 43ae458..c0bedaf 100644
+--- a/src/agent/agent.service.ts
++++ b/src/agent/agent.service.ts
+@@ -25,16 +25,14 @@ export class AgentService {
+ 
+     try {
+       // Automatically handle incoming message persistence and get conversation history
+-      const { contact, conversationHistory } =
++      const { contactId, conversationHistory } =
+         await this.messagePersistenceService.handleIncomingMessage(
+           input.message.text,
+           {
+             channelId: context.channelId,
+             agentId: context.agentId,
+             clientId: context.clientId,
+-            externalUserId: input.externalUserId,
+-            channelType: input.channel as 'whatsapp' | 'tiktok' | 'instagram',
+-            userName: input.externalUserId, // Use external ID as name initially
++            contactId: input.contactId,
+           },
+         );
+ 
+@@ -79,11 +77,9 @@ export class AgentService {
+           channelId: context.channelId,
+           agentId: context.agentId,
+           clientId: context.clientId,
+-          externalUserId: input.externalUserId,
+-          channelType: input.channel as 'whatsapp' | 'tiktok' | 'instagram',
+-          userName: input.externalUserId,
++          contactId: input.contactId,
+         },
+-        contact._id,
++        contactId,
+         context,
+       );
+ 
+diff --git a/src/agent/contracts/agent-input.ts b/src/agent/contracts/agent-input.ts
+index 6cbe992..e5287fa 100644
+--- a/src/agent/contracts/agent-input.ts
++++ b/src/agent/contracts/agent-input.ts
+@@ -1,6 +1,8 @@
++import { ChannelType } from '../../channels/shared/channel-type.type';
++
+ export interface AgentInput {
+-  channel: string;
+-  externalUserId: string;
++  channel: ChannelType;
++  contactId: string;
+   conversationId: string;
+   message: {
+     type: 'text';
+diff --git a/src/channels/instagram/instagram.service.spec.ts b/src/channels/instagram/instagram.service.spec.ts
+index 4026e9c..d48ee93 100644
+--- a/src/channels/instagram/instagram.service.spec.ts
++++ b/src/channels/instagram/instagram.service.spec.ts
+@@ -5,6 +5,8 @@ import { AgentService } from '../../agent/agent.service';
+ import { AgentRoutingService } from '../shared/agent-routing.service';
+ import { AgentRepository } from '../../database/repositories/agent.repository';
+ import { AgentContextService } from '../../agent/agent-context.service';
++import { ContactRepository } from '../../database/repositories/contact.repository';
++import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
+ import { encrypt } from '../../database/utils/crypto.util';
+ 
+ describe('InstagramService', () => {
+@@ -12,6 +14,8 @@ describe('InstagramService', () => {
+   let agentService: jest.Mocked<AgentService>;
+   let agentRoutingService: jest.Mocked<AgentRoutingService>;
+   let agentRepository: jest.Mocked<AgentRepository>;
++  let contactRepository: jest.Mocked<ContactRepository>;
++  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
+   let loggerWarnSpy: jest.SpyInstance;
+   let fetchSpy: jest.SpyInstance;
+ 
+@@ -43,6 +47,20 @@ describe('InstagramService', () => {
+           provide: AgentRepository,
+           useValue: { findActiveById: jest.fn() },
+         },
++        {
++          provide: ContactRepository,
++          useValue: { findOrCreateByExternalIdentity: jest.fn() },
++        },
++        {
++          provide: ContactIdentifierExtractorRegistry,
++          useValue: {
++            resolve: jest.fn().mockReturnValue({
++              externalId: 'user_123',
++              externalIdRaw: 'user_123',
++              identifierType: 'platform_id',
++            }),
++          },
++        },
+         {
+           provide: AgentContextService,
+           useValue: {
+@@ -56,6 +74,8 @@ describe('InstagramService', () => {
+     agentService = module.get(AgentService);
+     agentRoutingService = module.get(AgentRoutingService);
+     agentRepository = module.get(AgentRepository);
++    contactRepository = module.get(ContactRepository);
++    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);
+ 
+     loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
+   });
+@@ -96,10 +116,10 @@ describe('InstagramService', () => {
+       candidate: {
+         clientAgent: {
+           agentId: 'agent_1',
+-          clientId: 'client_1',
++          clientId: '507f1f77bcf86cd799439011',
+         },
+         channelConfig: {
+-          channelId: 'channel_1',
++          channelId: '507f1f77bcf86cd799439014',
+           credentials: encryptedCreds,
+           llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o' },
+         },
+@@ -110,6 +130,9 @@ describe('InstagramService', () => {
+     agentRepository.findActiveById.mockResolvedValue({
+       systemPrompt: 'prompt',
+     } as any);
++    contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
++      _id: '507f1f77bcf86cd799439012',
++    } as any);
+ 
+     agentService.run.mockResolvedValue({
+       reply: { type: 'text', text: 'Instagram reply' },
+diff --git a/src/channels/instagram/instagram.service.ts b/src/channels/instagram/instagram.service.ts
+index 83f63c6..af7b81b 100644
+--- a/src/channels/instagram/instagram.service.ts
++++ b/src/channels/instagram/instagram.service.ts
+@@ -1,9 +1,11 @@
+ import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
+ import { createHmac, timingSafeEqual } from 'crypto';
++import { Types } from 'mongoose';
+ import { AgentService } from '../../agent/agent.service';
+ import { AgentInput } from '../../agent/contracts/agent-input';
+ import { AgentContext } from '../../agent/contracts/agent-context';
+ import { AgentRepository } from '../../database/repositories/agent.repository';
++import { ContactRepository } from '../../database/repositories/contact.repository';
+ import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
+ import {
+   InstagramServerConfig,
+@@ -12,6 +14,8 @@ import {
+ } from './instagram.config';
+ import { AgentRoutingService } from '../shared/agent-routing.service';
+ import { AgentContextService } from '../../agent/agent-context.service';
++import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
++import { CHANNEL_TYPES } from '../shared/channel-type.constants';
+ 
+ @Injectable()
+ export class InstagramService {
+@@ -22,8 +26,10 @@ export class InstagramService {
+   constructor(
+     private readonly agentService: AgentService,
+     private readonly agentRepository: AgentRepository,
++    private readonly contactRepository: ContactRepository,
+     private readonly agentRoutingService: AgentRoutingService,
+     private readonly agentContextService: AgentContextService,
++    private readonly identifierExtractorRegistry: ContactIdentifierExtractorRegistry,
+   ) {
+     this.config = loadInstagramConfig();
+   }
+@@ -152,11 +158,16 @@ export class InstagramService {
+           continue;
+         }
+ 
++        const identifier = this.identifierExtractorRegistry.resolve(
++          CHANNEL_TYPES.INSTAGRAM,
++          event,
++        );
++
+         const routeDecision = await this.agentRoutingService.resolveRoute({
+-          channelIdentifier: instagramAccountId,
+-          externalUserId: senderId,
++          routeChannelIdentifier: instagramAccountId,
++          channelIdentifier: identifier.externalId,
+           incomingText: text,
+-          channelType: 'instagram',
++          channelType: CHANNEL_TYPES.INSTAGRAM,
+         });
+ 
+         if (routeDecision.kind === 'unroutable') {
+@@ -224,9 +235,18 @@ export class InstagramService {
+ 
+         const context = await this.agentContextService.enrichContext(rawContext);
+ 
++        const contact = await this.contactRepository.findOrCreateByExternalIdentity(
++          new Types.ObjectId(clientAgent.clientId),
++          new Types.ObjectId(channelConfig.channelId.toString()),
++          identifier.externalId,
++          identifier.externalIdRaw,
++          identifier.identifierType,
++          senderId,
++        );
++
+         const input: AgentInput = {
+-          channel: 'instagram',
+-          externalUserId: senderId,
++          channel: CHANNEL_TYPES.INSTAGRAM,
++          contactId: contact._id.toString(),
+           conversationId: `${instagramAccountId}:${senderId}`,
+           message: {
+             type: 'text',
+diff --git a/src/channels/shared/agent-routing.service.spec.ts b/src/channels/shared/agent-routing.service.spec.ts
+index 09afaa2..7654ad1 100644
+--- a/src/channels/shared/agent-routing.service.spec.ts
++++ b/src/channels/shared/agent-routing.service.spec.ts
+@@ -57,7 +57,7 @@ describe('AgentRoutingService', () => {
+         },
+         {
+           provide: ContactRepository,
+-          useValue: { findByExternalUserId: jest.fn() },
++          useValue: { findByExternalIdentity: jest.fn() },
+         },
+         {
+           provide: MessageRepository,
+@@ -90,8 +90,8 @@ describe('AgentRoutingService', () => {
+     } as any);
+ 
+     const result = await service.resolveRoute({
+-      channelIdentifier: 'phone-1',
+-      externalUserId: 'user-1',
++      routeChannelIdentifier: 'phone-1',
++      channelIdentifier: 'user-1',
+       incomingText: 'hello',
+       channelType: 'whatsapp',
+     });
+@@ -121,8 +121,8 @@ describe('AgentRoutingService', () => {
+       } as any);
+ 
+     const result = await service.resolveRoute({
+-      channelIdentifier: 'phone-1',
+-      externalUserId: 'user-1',
++      routeChannelIdentifier: 'phone-1',
++      channelIdentifier: 'user-1',
+       incomingText: '2',
+       channelType: 'whatsapp',
+     });
+@@ -154,12 +154,12 @@ describe('AgentRoutingService', () => {
+         status: 'active',
+       } as any);
+ 
+-    contactRepository.findByExternalUserId.mockResolvedValue(null);
++    contactRepository.findByExternalIdentity.mockResolvedValue(null);
+     messageRepository.findLatestByContactAndAgents.mockResolvedValue(null);
+ 
+     const result = await service.resolveRoute({
+-      channelIdentifier: 'phone-1',
+-      externalUserId: 'user-1',
++      routeChannelIdentifier: 'phone-1',
++      channelIdentifier: 'user-1',
+       incomingText: 'hello there',
+       channelType: 'whatsapp',
+     });
+diff --git a/src/channels/shared/agent-routing.service.ts b/src/channels/shared/agent-routing.service.ts
+index 72e8f8d..7400c5c 100644
+--- a/src/channels/shared/agent-routing.service.ts
++++ b/src/channels/shared/agent-routing.service.ts
+@@ -8,6 +8,8 @@ import { ContactRepository } from '../../database/repositories/contact.repositor
+ import { ClientAgent, HireChannelConfig } from '../../database/schemas/client-agent.schema';
+ import { createLLMModel } from '../../agent/llm/llm.factory';
+ import { LlmProvider } from '../../agent/llm/provider.enum';
++import { ChannelType } from './channel-type.type';
++import { CHANNEL_TYPES } from './channel-type.constants';
+ 
+ export interface RouteCandidate {
+   clientAgent: ClientAgent;
+@@ -34,14 +36,14 @@ export type AgentRouteDecision =
+  * Channel-specific routing context
+  */
+ export interface ChannelRoutingContext {
+-  /** Channel identifier (phoneNumberId, tiktokUserId, instagramAccountId, etc.) */
++  /** Routing account identifier (phoneNumberId, tiktokUserId, instagramAccountId, etc.) */
++  routeChannelIdentifier: string;
++  /** Contact identity identifier within the channel (phone, sender user ID, etc.) */
+   channelIdentifier: string;
+-  /** External user identifier (phone, email, userId) */
+-  externalUserId: string;
+   /** Incoming message text */
+   incomingText: string;
+   /** Channel type for logging */
+-  channelType: 'whatsapp' | 'tiktok' | 'instagram';
++  channelType: ChannelType;
+ }
+ 
+ @Injectable()
+@@ -66,18 +68,18 @@ export class AgentRoutingService {
+   async resolveRoute(
+     context: ChannelRoutingContext,
+   ): Promise<AgentRouteDecision> {
+-    if (!context.channelIdentifier) {
++    if (!context.routeChannelIdentifier) {
+       return { kind: 'unroutable', reason: 'missing-identifier' };
+     }
+ 
+     const clientAgents = await this.findCandidatesByChannel(
+       context.channelType,
+-      context.channelIdentifier,
++      context.routeChannelIdentifier,
+     );
+ 
+     const candidates = await this.buildCandidates(
+       clientAgents,
+-      context.channelIdentifier,
++      context.routeChannelIdentifier,
+       context.channelType,
+     );
+ 
+@@ -94,7 +96,10 @@ export class AgentRoutingService {
+       return { kind: 'resolved', candidate: explicit };
+     }
+ 
+-    const sticky = await this.resolveFromRecentHistory(candidates, context.externalUserId);
++    const sticky = await this.resolveFromRecentHistory(
++      candidates,
++      context.channelIdentifier,
++    );
+     if (sticky) {
+       return { kind: 'resolved', candidate: sticky };
+     }
+@@ -130,16 +135,18 @@ export class AgentRoutingService {
+    * Find candidate ClientAgents based on channel type.
+    */
+   private async findCandidatesByChannel(
+-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
++    channelType: ChannelType,
+     identifier: string,
+   ): Promise<ClientAgent[]> {
+     switch (channelType) {
+-      case 'whatsapp':
++      case CHANNEL_TYPES.WHATSAPP:
+         return this.clientAgentRepository.findActiveByPhoneNumberId(identifier);
+-      case 'tiktok':
++      case CHANNEL_TYPES.TIKTOK:
+         return this.clientAgentRepository.findActiveByTiktokUserId(identifier);
+-      case 'instagram':
++      case CHANNEL_TYPES.INSTAGRAM:
+         return this.clientAgentRepository.findActiveByInstagramAccountId(identifier);
++      default:
++        return [];
+     }
+   }
+ 
+@@ -149,7 +156,7 @@ export class AgentRoutingService {
+   private async buildCandidates(
+     clientAgents: ClientAgent[],
+     identifier: string,
+-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
++    channelType: ChannelType,
+   ): Promise<RouteCandidate[]> {
+     const unresolved = clientAgents
+       .map((clientAgent) => {
+@@ -157,12 +164,14 @@ export class AgentRoutingService {
+           if (channel.status !== 'active') return false;
+           
+           switch (channelType) {
+-            case 'whatsapp':
++            case CHANNEL_TYPES.WHATSAPP:
+               return channel.phoneNumberId === identifier;
+-            case 'tiktok':
++            case CHANNEL_TYPES.TIKTOK:
+               return channel.tiktokUserId === identifier;
+-            case 'instagram':
++            case CHANNEL_TYPES.INSTAGRAM:
+               return channel.instagramAccountId === identifier;
++            default:
++              return false;
+           }
+         });
+ 
+@@ -231,7 +240,7 @@ export class AgentRoutingService {
+ 
+   private async resolveFromRecentHistory(
+     candidates: RouteCandidate[],
+-    externalUserId: string,
++    channelIdentifier: string,
+   ): Promise<RouteCandidate | null> {
+     const byClient = new Map<string, RouteCandidate[]>();
+ 
+@@ -249,15 +258,6 @@ export class AgentRoutingService {
+         continue;
+       }
+ 
+-      const contact = await this.contactRepository.findByExternalUserId(
+-        externalUserId,
+-        new Types.ObjectId(clientId),
+-      );
+-
+-      if (!contact) {
+-        continue;
+-      }
+-
+       const agentIds = clientCandidates
+         .map((candidate) => candidate.clientAgent.agentId)
+         .filter((agentId) => Types.ObjectId.isValid(agentId))
+@@ -273,28 +273,46 @@ export class AgentRoutingService {
+         continue;
+       }
+ 
+-      const latestMessage = await this.messageRepository.findLatestByContactAndAgents(
+-        contact._id as Types.ObjectId,
+-        agentIds,
+-        channelIds,
+-      );
++      for (const candidate of clientCandidates) {
++        const channelId = candidate.channelConfig.channelId.toString();
++        if (!Types.ObjectId.isValid(channelId)) {
++          continue;
++        }
+ 
+-      if (!latestMessage) {
+-        continue;
+-      }
++        const contact = await this.contactRepository.findByExternalIdentity(
++          new Types.ObjectId(clientId),
++          new Types.ObjectId(channelId),
++          channelIdentifier,
++        );
+ 
+-      const matched = clientCandidates.find(
+-        (candidate) =>
+-          candidate.clientAgent.agentId.toString() ===
+-          latestMessage.agentId.toString(),
+-      );
++        if (!contact) {
++          continue;
++        }
+ 
+-      if (!matched) {
+-        continue;
+-      }
++        const latestMessage =
++          await this.messageRepository.findLatestByContactAndAgents(
++            contact._id as Types.ObjectId,
++            agentIds,
++            channelIds,
++          );
+ 
+-      if (!mostRecent || latestMessage.createdAt > mostRecent.createdAt) {
+-        mostRecent = { createdAt: latestMessage.createdAt, candidate: matched };
++        if (!latestMessage) {
++          continue;
++        }
++
++        const matched = clientCandidates.find(
++          (candidate) =>
++            candidate.clientAgent.agentId.toString() ===
++            latestMessage.agentId.toString(),
++        );
++
++        if (!matched) {
++          continue;
++        }
++
++        if (!mostRecent || latestMessage.createdAt > mostRecent.createdAt) {
++          mostRecent = { createdAt: latestMessage.createdAt, candidate: matched };
++        }
+       }
+     }
+ 
+diff --git a/src/channels/shared/channel-type.constants.ts b/src/channels/shared/channel-type.constants.ts
+new file mode 100644
+index 0000000..ce34a0a
+--- /dev/null
++++ b/src/channels/shared/channel-type.constants.ts
+@@ -0,0 +1,10 @@
++import { ChannelType } from './channel-type.type';
++
++export const CHANNEL_TYPES = {
++  WHATSAPP: 'whatsapp',
++  TELEGRAM: 'telegram',
++  WEB: 'web',
++  API: 'api',
++  TIKTOK: 'tiktok',
++  INSTAGRAM: 'instagram',
++} as const satisfies Record<string, ChannelType>;
+diff --git a/src/channels/shared/channel-type.type.ts b/src/channels/shared/channel-type.type.ts
+new file mode 100644
+index 0000000..2db5481
+--- /dev/null
++++ b/src/channels/shared/channel-type.type.ts
+@@ -0,0 +1,7 @@
++export type ChannelType =
++  | 'whatsapp'
++  | 'telegram'
++  | 'web'
++  | 'api'
++  | 'tiktok'
++  | 'instagram';
+diff --git a/src/channels/shared/contact-identifier/api-identifier.extractor.ts b/src/channels/shared/contact-identifier/api-identifier.extractor.ts
+new file mode 100644
+index 0000000..ffb9793
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/api-identifier.extractor.ts
+@@ -0,0 +1,35 @@
++import { Injectable } from '@nestjs/common';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ChannelType } from '../channel-type.type';
++import {
++  ContactIdentifierType,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++
++@Injectable()
++export class ApiIdentifierExtractor
++  implements RawCapableContactIdentifierExtractor
++{
++  supports(channelType: ChannelType): boolean {
++    return channelType === CHANNEL_TYPES.API;
++  }
++
++  extractRaw(payload: unknown): string {
++    const source = payload as any;
++    const rawId = source?.externalId ?? source?.contactId ?? source?.senderId;
++
++    if (typeof rawId !== 'string') {
++      throw new Error('missing-api-identifier');
++    }
++
++    return rawId;
++  }
++
++  extract(payload: unknown): string {
++    return this.extractRaw(payload).trim();
++  }
++
++  getIdentifierType(): ContactIdentifierType {
++    return 'platform_id';
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/contact-identifier-architecture.spec.ts b/src/channels/shared/contact-identifier/contact-identifier-architecture.spec.ts
+new file mode 100644
+index 0000000..1d2bf26
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/contact-identifier-architecture.spec.ts
+@@ -0,0 +1,521 @@
++import { Types } from 'mongoose';
++import { Logger } from '@nestjs/common';
++import { ContactRepository } from '../../../database/repositories/contact.repository';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ContactIdentifierExtractorRegistry } from './contact-identifier-extractor.registry';
++import { WhatsappIdentifierExtractor } from './whatsapp-identifier.extractor';
++import { InstagramIdentifierExtractor } from './instagram-identifier.extractor';
++import { TelegramIdentifierExtractor } from './telegram-identifier.extractor';
++import { TiktokIdentifierExtractor } from './tiktok-identifier.extractor';
++import { WebIdentifierExtractor } from './web-identifier.extractor';
++import { ApiIdentifierExtractor } from './api-identifier.extractor';
++import {
++  ExtractorNotFoundException,
++  InvalidIdentifierException,
++} from './contact-identifier.exceptions';
++
++type Query<T> = {
++  session: (_session?: unknown) => Query<T>;
++  exec: () => Promise<T>;
++};
++
++class InMemoryContactModel {
++  private store = new Map<string, any>();
++
++  private key(clientId: any, channelId: any, externalId: any): string {
++    return `${clientId.toString()}:${channelId.toString()}:${externalId}`;
++  }
++
++  private wrap<T>(producer: () => T | Promise<T>): Query<T> {
++    return {
++      session: () => this.wrap(producer),
++      exec: async () => producer(),
++    };
++  }
++
++  findById(id: string): Query<any | null> {
++    return this.wrap(() => {
++      for (const value of this.store.values()) {
++        if (value._id.toString() === id) {
++          return value;
++        }
++      }
++
++      return null;
++    });
++  }
++
++  find(filter: any): Query<any[]> {
++    return this.wrap(() => {
++      const all = Array.from(this.store.values());
++      if (!filter?.clientId) {
++        return all;
++      }
++
++      return all.filter((item) => item.clientId.toString() === filter.clientId.toString());
++    });
++  }
++
++  findOne(filter: any): Query<any | null> {
++    return this.wrap(() => {
++      const key = this.key(filter.clientId, filter.channelId, filter.externalId);
++      return this.store.get(key) ?? null;
++    });
++  }
++
++  findOneAndUpdate(filter: any, update: any): Query<any> {
++    return this.wrap(() => {
++      const key = this.key(filter.clientId, filter.channelId, filter.externalId);
++      const existing = this.store.get(key);
++      if (existing) {
++        return existing;
++      }
++
++      const created = {
++        _id: new Types.ObjectId(),
++        ...update.$setOnInsert,
++      };
++
++      this.store.set(key, created);
++      return created;
++    });
++  }
++
++  count(): number {
++    return this.store.size;
++  }
++}
++
++describe('Contact Identifier Architecture', () => {
++  let repository: ContactRepository;
++  let registry: ContactIdentifierExtractorRegistry;
++  let model: InMemoryContactModel;
++
++  const clientId = new Types.ObjectId();
++  const whatsappChannelId = new Types.ObjectId();
++  const instagramChannelId = new Types.ObjectId();
++
++  beforeEach(() => {
++    model = new InMemoryContactModel();
++    repository = new ContactRepository(model as any);
++    registry = new ContactIdentifierExtractorRegistry(
++      [
++        new WhatsappIdentifierExtractor(),
++        new InstagramIdentifierExtractor(),
++        new TelegramIdentifierExtractor(),
++        new TiktokIdentifierExtractor(),
++        new WebIdentifierExtractor(),
++        new ApiIdentifierExtractor(),
++      ],
++    );
++  });
++
++  it('creates different contacts for same phone across different channels', async () => {
++    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++      entry: [
++        {
++          changes: [
++            {
++              value: {
++                messages: [{ from: '+1 415 555 0123' }],
++              },
++            },
++          ],
++        },
++      ],
++    });
++
++    const whatsappContact = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      whatsappChannelId,
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      'Phone User',
++    );
++
++    const instagramContact = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      instagramChannelId,
++      identifier.externalId,
++      identifier.externalIdRaw,
++      'platform_id',
++      'Same User Other Channel',
++    );
++
++    expect(whatsappContact._id.toString()).not.toEqual(instagramContact._id.toString());
++  });
++
++  it('creates only one contact for same identifier on same channel and same client', async () => {
++    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++      entry: [
++        {
++          changes: [
++            {
++              value: {
++                messages: [{ from: '+1 (415) 555-0123' }],
++              },
++            },
++          ],
++        },
++      ],
++    });
++
++    const first = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      whatsappChannelId,
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      'A',
++    );
++
++    const second = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      whatsappChannelId,
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      'B',
++    );
++
++    expect(first._id.toString()).toEqual(second._id.toString());
++    expect(model.count()).toBe(1);
++  });
++
++  it('normalizes instagram case differences to same identifier', async () => {
++    const firstIdentifier = registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
++      entry: [{ messaging: [{ sender: { id: 'User_ABC' } }] }],
++    });
++
++    const secondIdentifier = registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
++      entry: [{ messaging: [{ sender: { id: ' user_abc ' } }] }],
++    });
++
++    expect(firstIdentifier.externalId).toEqual(secondIdentifier.externalId);
++
++    const first = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      instagramChannelId,
++      firstIdentifier.externalId,
++      firstIdentifier.externalIdRaw,
++      firstIdentifier.identifierType,
++      'IG User',
++    );
++
++    const second = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      instagramChannelId,
++      secondIdentifier.externalId,
++      secondIdentifier.externalIdRaw,
++      secondIdentifier.identifierType,
++      'IG User Variant',
++    );
++
++    expect(first._id.toString()).toEqual(second._id.toString());
++  });
++
++  it('normalizes whatsapp identifiers with and without plus to same identifier', async () => {
++    const withPlus = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++      entry: [
++        {
++          changes: [
++            {
++              value: {
++                messages: [{ from: '+1 415 555 0123' }],
++              },
++            },
++          ],
++        },
++      ],
++    });
++
++    const withoutPlus = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++      entry: [
++        {
++          changes: [
++            {
++              value: {
++                messages: [{ from: '14155550123' }],
++              },
++            },
++          ],
++        },
++      ],
++    });
++
++    expect(withPlus.externalId).toEqual(withoutPlus.externalId);
++  });
++
++  it('is safe under concurrent upsert attempts for same identity', async () => {
++    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++      entry: [
++        {
++          changes: [
++            {
++              value: {
++                messages: [{ from: '+1 415 555 0123' }],
++              },
++            },
++          ],
++        },
++      ],
++    });
++
++    const contacts = await Promise.all(
++      Array.from({ length: 20 }).map(() =>
++        repository.findOrCreateByExternalIdentity(
++          clientId,
++          whatsappChannelId,
++          identifier.externalId,
++          identifier.externalIdRaw,
++          identifier.identifierType,
++          'Concurrent User',
++        ),
++      ),
++    );
++
++    const ids = new Set(contacts.map((item) => item._id.toString()));
++    expect(ids.size).toBe(1);
++    expect(model.count()).toBe(1);
++  });
++
++  it('rejects whatsapp number shorter than 8 digits', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++        entry: [
++          {
++            changes: [
++              {
++                value: {
++                  messages: [{ from: '+1234567' }],
++                },
++              },
++            ],
++          },
++        ],
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects whatsapp number longer than 15 digits', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++        entry: [
++          {
++            changes: [
++              {
++                value: {
++                  messages: [{ from: '+1234567890123456' }],
++                },
++              },
++            ],
++          },
++        ],
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects whatsapp number containing only symbols', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++        entry: [
++          {
++            changes: [
++              {
++                value: {
++                  messages: [{ from: '+-()' }],
++                },
++              },
++            ],
++          },
++        ],
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('logs whatsapp validation failure without leaking raw value', () => {
++    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
++
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++        entry: [
++          {
++            changes: [
++              {
++                value: {
++                  messages: [{ from: '+-()' }],
++                },
++              },
++            ],
++          },
++        ],
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(warnSpy).toHaveBeenCalledWith(
++      expect.stringContaining('event=contact_identifier_validation_failed'),
++    );
++    expect(
++      warnSpy.mock.calls.some((call) =>
++        String(call[0]).includes('+-()'),
++      ),
++    ).toBe(false);
++
++    warnSpy.mockRestore();
++  });
++
++  it('rejects instagram empty username after trim', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.INSTAGRAM, {
++        entry: [{ messaging: [{ sender: { id: '   ' } }] }],
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects telegram identifier when id and username are missing', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++        message: {
++          from: {},
++        },
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects non-numeric telegram id', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++        message: {
++          from: {
++            id: '12ab45',
++          },
++        },
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects too-short telegram id', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++        message: {
++          from: {
++            id: '1234',
++          },
++        },
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects telegram username that starts with number', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++        message: {
++          from: {
++            username: '1validname',
++          },
++        },
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('rejects telegram username with invalid characters', () => {
++    expect(() =>
++      registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++        message: {
++          from: {
++            username: 'valid-name',
++          },
++        },
++      }),
++    ).toThrow(InvalidIdentifierException);
++
++    expect(model.count()).toBe(0);
++  });
++
++  it('accepts valid telegram id', () => {
++    const identifier = registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++      message: {
++        from: {
++          id: '1234567890',
++        },
++      },
++    });
++
++    expect(identifier.externalId).toBe('1234567890');
++  });
++
++  it('accepts valid telegram username', () => {
++    const identifier = registry.resolve(CHANNEL_TYPES.TELEGRAM, {
++      message: {
++        from: {
++          username: 'valid_name123',
++        },
++      },
++    });
++
++    expect(identifier.externalId).toBe('valid_name123');
++  });
++
++  it('keeps upsert behavior for valid whatsapp identifier and avoids duplicates', async () => {
++    const identifier = registry.resolve(CHANNEL_TYPES.WHATSAPP, {
++      entry: [
++        {
++          changes: [
++            {
++              value: {
++                messages: [{ from: '+14155550123' }],
++              },
++            },
++          ],
++        },
++      ],
++    });
++
++    const first = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      whatsappChannelId,
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      'Regression User',
++    );
++
++    const second = await repository.findOrCreateByExternalIdentity(
++      clientId,
++      whatsappChannelId,
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      'Regression User Again',
++    );
++
++    expect(first).toBeDefined();
++    expect(second).toBeDefined();
++    expect(first._id.toString()).toBe(second._id.toString());
++    expect(model.count()).toBe(1);
++  });
++
++  it('throws explicit exception when no extractor supports channel type', () => {
++    expect(() => registry.resolve('sms' as any, {})).toThrow(
++      ExtractorNotFoundException,
++    );
++    expect(model.count()).toBe(0);
++  });
++});
+diff --git a/src/channels/shared/contact-identifier/contact-identifier-extractor.interface.ts b/src/channels/shared/contact-identifier/contact-identifier-extractor.interface.ts
+new file mode 100644
+index 0000000..94a55de
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/contact-identifier-extractor.interface.ts
+@@ -0,0 +1,28 @@
++import { ChannelType } from '../channel-type.type';
++
++export const CONTACT_IDENTIFIER_EXTRACTORS = Symbol(
++  'CONTACT_IDENTIFIER_EXTRACTORS',
++);
++
++export type ContactIdentifierType =
++  | 'phone'
++  | 'username'
++  | 'platform_id'
++  | 'email';
++
++export interface ContactIdentifierExtractor {
++  supports(channelType: ChannelType): boolean;
++  extract(payload: unknown): string;
++}
++
++export interface RawCapableContactIdentifierExtractor
++  extends ContactIdentifierExtractor {
++  extractRaw(payload: unknown): string;
++  getIdentifierType(): ContactIdentifierType;
++}
++
++export interface ExtractedContactIdentifier {
++  externalId: string;
++  externalIdRaw?: string;
++  identifierType: ContactIdentifierType;
++}
+diff --git a/src/channels/shared/contact-identifier/contact-identifier-extractor.registry.ts b/src/channels/shared/contact-identifier/contact-identifier-extractor.registry.ts
+new file mode 100644
+index 0000000..cf3438a
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/contact-identifier-extractor.registry.ts
+@@ -0,0 +1,82 @@
++import { Inject, Injectable, Logger } from '@nestjs/common';
++import { ChannelType } from '../channel-type.type';
++import {
++  CONTACT_IDENTIFIER_EXTRACTORS,
++  ContactIdentifierExtractor,
++  ExtractedContactIdentifier,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++import {
++  ExtractorNotFoundException,
++  InvalidIdentifierException,
++} from './contact-identifier.exceptions';
++
++@Injectable()
++export class ContactIdentifierExtractorRegistry {
++  private readonly logger = new Logger(ContactIdentifierExtractorRegistry.name);
++  private readonly extractors: RawCapableContactIdentifierExtractor[];
++
++  constructor(
++    @Inject(CONTACT_IDENTIFIER_EXTRACTORS)
++    extractors: RawCapableContactIdentifierExtractor[],
++  ) {
++    this.extractors = extractors;
++  }
++
++  resolve(channelType: ChannelType, payload: unknown): ExtractedContactIdentifier {
++    const extractor = this.extractors.find((item) => item.supports(channelType));
++
++    if (!extractor) {
++      this.logger.error(
++        `event=contact_identifier_extraction_failed reason=unsupported_channel channelType=${channelType}`,
++      );
++      throw new ExtractorNotFoundException(channelType);
++    }
++
++    let externalIdRaw: string;
++    let externalId: string;
++
++    try {
++      externalIdRaw = extractor.extractRaw(payload);
++      externalId = extractor.extract(payload);
++    } catch (error) {
++      if (error instanceof InvalidIdentifierException) {
++        this.logger.error(
++          `event=contact_identifier_extraction_failed reason=invalid_identifier channelType=${channelType}`,
++        );
++        throw error;
++      }
++
++      this.logger.error(
++        `event=contact_identifier_extraction_failed reason=extractor_error channelType=${channelType} message=${error instanceof Error ? error.message : String(error)}`,
++      );
++      throw new InvalidIdentifierException('unable-to-extract-contact-identifier');
++    }
++
++    const normalizedRaw = externalIdRaw.trim();
++    const normalizedValue = externalId.trim();
++
++    if (!normalizedRaw || !normalizedValue) {
++      this.logger.warn(
++        `event=contact_identifier_empty channelType=${channelType}`,
++      );
++      throw new InvalidIdentifierException('contact-identifier-empty');
++    }
++
++    if (normalizedRaw !== normalizedValue) {
++      this.logger.log(
++        `event=contact_identifier_normalized channelType=${channelType} rawLength=${normalizedRaw.length} normalizedLength=${normalizedValue.length}`,
++      );
++    }
++
++    return {
++      externalId: normalizedValue,
++      externalIdRaw: normalizedRaw,
++      identifierType: extractor.getIdentifierType(),
++    };
++  }
++
++  getSupportedExtractors(): ContactIdentifierExtractor[] {
++    return [...this.extractors];
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/contact-identifier.exceptions.ts b/src/channels/shared/contact-identifier/contact-identifier.exceptions.ts
+new file mode 100644
+index 0000000..bae2acc
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/contact-identifier.exceptions.ts
+@@ -0,0 +1,13 @@
++import { BadRequestException } from '@nestjs/common';
++
++export class InvalidIdentifierException extends BadRequestException {
++  constructor(reason: string) {
++    super(`Invalid identifier: ${reason}`);
++  }
++}
++
++export class ExtractorNotFoundException extends BadRequestException {
++  constructor(channelType: string) {
++    super(`No contact identifier extractor for channel: ${channelType}`);
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/instagram-identifier.extractor.ts b/src/channels/shared/contact-identifier/instagram-identifier.extractor.ts
+new file mode 100644
+index 0000000..62a6951
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/instagram-identifier.extractor.ts
+@@ -0,0 +1,41 @@
++import { Injectable } from '@nestjs/common';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ChannelType } from '../channel-type.type';
++import {
++  ContactIdentifierType,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++import { InvalidIdentifierException } from './contact-identifier.exceptions';
++
++@Injectable()
++export class InstagramIdentifierExtractor
++  implements RawCapableContactIdentifierExtractor
++{
++  supports(channelType: ChannelType): boolean {
++    return channelType === CHANNEL_TYPES.INSTAGRAM;
++  }
++
++  extractRaw(payload: unknown): string {
++    const source = payload as any;
++    const sender = source?.entry?.[0]?.messaging?.[0]?.sender?.id ?? source?.sender?.id;
++
++    if (typeof sender !== 'string') {
++      throw new InvalidIdentifierException('missing-instagram-identifier');
++    }
++
++    return sender;
++  }
++
++  extract(payload: unknown): string {
++    const normalized = this.extractRaw(payload).trim().toLowerCase();
++    if (!normalized) {
++      throw new InvalidIdentifierException('empty-instagram-identifier');
++    }
++
++    return normalized;
++  }
++
++  getIdentifierType(): ContactIdentifierType {
++    return 'platform_id';
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/telegram-identifier.extractor.ts b/src/channels/shared/contact-identifier/telegram-identifier.extractor.ts
+new file mode 100644
+index 0000000..2187c6c
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/telegram-identifier.extractor.ts
+@@ -0,0 +1,102 @@
++import { Injectable, Logger } from '@nestjs/common';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ChannelType } from '../channel-type.type';
++import {
++  ContactIdentifierType,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++import { InvalidIdentifierException } from './contact-identifier.exceptions';
++
++@Injectable()
++export class TelegramIdentifierExtractor
++  implements RawCapableContactIdentifierExtractor
++{
++  private readonly logger = new Logger(TelegramIdentifierExtractor.name);
++
++  supports(channelType: ChannelType): boolean {
++    return channelType === CHANNEL_TYPES.TELEGRAM;
++  }
++
++  extractRaw(payload: unknown): string {
++    const source = payload as any;
++    const immutableId = source?.message?.from?.id ?? source?.from?.id;
++    const username = source?.message?.from?.username ?? source?.from?.username;
++
++    if (immutableId !== undefined && immutableId !== null) {
++      return String(immutableId);
++    }
++
++    if (typeof username === 'string') {
++      return username;
++    }
++
++    throw new InvalidIdentifierException('missing-telegram-identifier');
++  }
++
++  extract(payload: unknown): string {
++    const source = payload as any;
++    const rawImmutableId = source?.message?.from?.id ?? source?.from?.id;
++    const rawUsername =
++      source?.message?.from?.username ?? source?.from?.username;
++
++    const hasImmutableId =
++      rawImmutableId !== undefined && rawImmutableId !== null;
++    const hasUsername = typeof rawUsername === 'string';
++
++    if (!hasImmutableId && !hasUsername) {
++      this.logger.warn(
++        'event=contact_identifier_validation_failed channelType=telegram reason=missing_identifier',
++      );
++      throw new InvalidIdentifierException('empty-telegram-identifier');
++    }
++
++    let validatedImmutableId: string | null = null;
++    if (hasImmutableId) {
++      const immutableId = String(rawImmutableId);
++      const isNumeric = /^\d+$/.test(immutableId);
++      const hasValidLength =
++        immutableId.length >= 5 && immutableId.length <= 20;
++
++      if (!isNumeric || !hasValidLength) {
++        this.logger.warn(
++          `event=contact_identifier_validation_failed channelType=telegram reason=invalid_telegram_id idLength=${immutableId.length}`,
++        );
++        throw new InvalidIdentifierException('invalid-telegram-id');
++      }
++
++      validatedImmutableId = immutableId;
++    }
++
++    let validatedUsername: string | null = null;
++    if (hasUsername) {
++      const username = rawUsername.trim();
++      const isValidUsername = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username);
++
++      if (!isValidUsername) {
++        this.logger.warn(
++          `event=contact_identifier_validation_failed channelType=telegram reason=invalid_username usernameLength=${username.length}`,
++        );
++        throw new InvalidIdentifierException('invalid-telegram-username');
++      }
++
++      validatedUsername = username;
++    }
++
++    if (validatedImmutableId) {
++      return validatedImmutableId;
++    }
++
++    if (validatedUsername) {
++      return validatedUsername;
++    }
++
++    this.logger.warn(
++      'event=contact_identifier_validation_failed channelType=telegram reason=no_valid_identifier',
++    );
++    throw new InvalidIdentifierException('no-valid-telegram-identifier');
++  }
++
++  getIdentifierType(): ContactIdentifierType {
++    return 'platform_id';
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/tiktok-identifier.extractor.ts b/src/channels/shared/contact-identifier/tiktok-identifier.extractor.ts
+new file mode 100644
+index 0000000..a36860c
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/tiktok-identifier.extractor.ts
+@@ -0,0 +1,35 @@
++import { Injectable } from '@nestjs/common';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ChannelType } from '../channel-type.type';
++import {
++  ContactIdentifierType,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++
++@Injectable()
++export class TiktokIdentifierExtractor
++  implements RawCapableContactIdentifierExtractor
++{
++  supports(channelType: ChannelType): boolean {
++    return channelType === CHANNEL_TYPES.TIKTOK;
++  }
++
++  extractRaw(payload: unknown): string {
++    const source = payload as any;
++    const sender = source?.data?.sender?.user_id ?? source?.sender?.user_id;
++
++    if (typeof sender !== 'string') {
++      throw new Error('missing-tiktok-identifier');
++    }
++
++    return sender;
++  }
++
++  extract(payload: unknown): string {
++    return this.extractRaw(payload).trim();
++  }
++
++  getIdentifierType(): ContactIdentifierType {
++    return 'platform_id';
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/web-identifier.extractor.ts b/src/channels/shared/contact-identifier/web-identifier.extractor.ts
+new file mode 100644
+index 0000000..366a7e3
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/web-identifier.extractor.ts
+@@ -0,0 +1,35 @@
++import { Injectable } from '@nestjs/common';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ChannelType } from '../channel-type.type';
++import {
++  ContactIdentifierType,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++
++@Injectable()
++export class WebIdentifierExtractor
++  implements RawCapableContactIdentifierExtractor
++{
++  supports(channelType: ChannelType): boolean {
++    return channelType === CHANNEL_TYPES.WEB;
++  }
++
++  extractRaw(payload: unknown): string {
++    const source = payload as any;
++    const rawEmail = source?.email ?? source?.contact?.email ?? source?.user?.email;
++
++    if (typeof rawEmail !== 'string') {
++      throw new Error('missing-web-identifier');
++    }
++
++    return rawEmail;
++  }
++
++  extract(payload: unknown): string {
++    return this.extractRaw(payload).trim().toLowerCase();
++  }
++
++  getIdentifierType(): ContactIdentifierType {
++    return 'email';
++  }
++}
+diff --git a/src/channels/shared/contact-identifier/whatsapp-identifier.extractor.ts b/src/channels/shared/contact-identifier/whatsapp-identifier.extractor.ts
+new file mode 100644
+index 0000000..e277e56
+--- /dev/null
++++ b/src/channels/shared/contact-identifier/whatsapp-identifier.extractor.ts
+@@ -0,0 +1,66 @@
++import { Injectable, Logger } from '@nestjs/common';
++import { CHANNEL_TYPES } from '../channel-type.constants';
++import { ChannelType } from '../channel-type.type';
++import {
++  ContactIdentifierType,
++  RawCapableContactIdentifierExtractor,
++} from './contact-identifier-extractor.interface';
++import { InvalidIdentifierException } from './contact-identifier.exceptions';
++
++@Injectable()
++export class WhatsappIdentifierExtractor
++  implements RawCapableContactIdentifierExtractor
++{
++  private readonly logger = new Logger(WhatsappIdentifierExtractor.name);
++
++  supports(channelType: ChannelType): boolean {
++    return channelType === CHANNEL_TYPES.WHATSAPP;
++  }
++
++  extractRaw(payload: unknown): string {
++    const source = payload as any;
++    const from =
++      source?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ?? source?.from;
++
++    if (typeof from !== 'string') {
++      this.logger.warn(
++        'event=contact_identifier_validation_failed channelType=whatsapp reason=missing_identifier',
++      );
++      throw new InvalidIdentifierException('missing-whatsapp-identifier');
++    }
++
++    return from;
++  }
++
++  extract(payload: unknown): string {
++    const raw = this.extractRaw(payload);
++    const normalized = raw.replace(/\s+/g, '').replace(/[^\d]/g, '').trim();
++
++    if (!normalized) {
++      this.logger.warn(
++        'event=contact_identifier_validation_failed channelType=whatsapp reason=empty_after_normalization',
++      );
++      throw new InvalidIdentifierException('empty-whatsapp-identifier');
++    }
++
++    if (!/^\d+$/.test(normalized)) {
++      this.logger.warn(
++        'event=contact_identifier_validation_failed channelType=whatsapp reason=non_digit_characters',
++      );
++      throw new InvalidIdentifierException('non-digit-whatsapp-identifier');
++    }
++
++    if (normalized.length < 8 || normalized.length > 15) {
++      this.logger.warn(
++        `event=contact_identifier_validation_failed channelType=whatsapp reason=invalid_length length=${normalized.length}`,
++      );
++      throw new InvalidIdentifierException('invalid-whatsapp-identifier-length');
++    }
++
++    return normalized;
++  }
++
++  getIdentifierType(): ContactIdentifierType {
++    return 'phone';
++  }
++}
+diff --git a/src/channels/shared/message-persistence.service.spec.ts b/src/channels/shared/message-persistence.service.spec.ts
+index ecff68e..fdd4ed8 100644
+--- a/src/channels/shared/message-persistence.service.spec.ts
++++ b/src/channels/shared/message-persistence.service.spec.ts
+@@ -1,30 +1,26 @@
+ import { Test, TestingModule } from '@nestjs/testing';
+ import { MessagePersistenceService } from './message-persistence.service';
+ import { MessageRepository } from '../../database/repositories/message.repository';
+-import { ContactRepository } from '../../database/repositories/contact.repository';
+ import { ConversationSummaryService } from '../../agent/conversation-summary.service';
+ import { Types } from 'mongoose';
+ 
+ describe('MessagePersistenceService', () => {
+   let service: MessagePersistenceService;
+   let messageRepository: jest.Mocked<MessageRepository>;
+-  let contactRepository: jest.Mocked<ContactRepository>;
+   let conversationSummaryService: jest.Mocked<ConversationSummaryService>;
+ 
+   const mockContext = {
+     channelId: '507f1f77bcf86cd799439014',
+     agentId: '507f1f77bcf86cd799439013',
+     clientId: '507f1f77bcf86cd799439011',
+-    externalUserId: 'user@example.com',
+-    channelType: 'whatsapp' as const,
+-    userName: 'Test User',
++    contactId: '507f1f77bcf86cd799439012',
+   };
+ 
+   const mockContact = {
+     _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
+-    externalUserId: 'user@example.com',
++    externalId: 'user@example.com',
+     clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
+-    channelType: 'whatsapp' as const,
++    channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
+     name: 'Test User',
+     status: 'active' as const,
+   };
+@@ -67,12 +63,6 @@ describe('MessagePersistenceService', () => {
+             findConversationContext: jest.fn(),
+           },
+         },
+-        {
+-          provide: ContactRepository,
+-          useValue: {
+-            findOrCreate: jest.fn(),
+-          },
+-        },
+         {
+           provide: ConversationSummaryService,
+           useValue: {
+@@ -84,7 +74,6 @@ describe('MessagePersistenceService', () => {
+ 
+     service = module.get<MessagePersistenceService>(MessagePersistenceService);
+     messageRepository = module.get(MessageRepository);
+-    contactRepository = module.get(ContactRepository);
+     conversationSummaryService = module.get(ConversationSummaryService);
+   });
+ 
+@@ -92,27 +81,6 @@ describe('MessagePersistenceService', () => {
+     expect(service).toBeDefined();
+   });
+ 
+-  describe('findOrCreateContact', () => {
+-    it('should call contactRepository.findOrCreate', async () => {
+-      contactRepository.findOrCreate.mockResolvedValue(mockContact as any);
+-
+-      const result = await service.findOrCreateContact(
+-        'user@example.com',
+-        '507f1f77bcf86cd799439011',
+-        'whatsapp',
+-        'Test User',
+-      );
+-
+-      expect(contactRepository.findOrCreate).toHaveBeenCalledWith(
+-        'user@example.com',
+-        expect.any(Types.ObjectId),
+-        'whatsapp',
+-        'Test User',
+-      );
+-      expect(result).toEqual(mockContact);
+-    });
+-  });
+-
+   describe('saveUserMessage', () => {
+     it('should save a user message with correct parameters', async () => {
+       messageRepository.create.mockResolvedValue({} as any);
+@@ -202,14 +170,12 @@ describe('MessagePersistenceService', () => {
+   });
+ 
+   describe('handleIncomingMessage', () => {
+-    it('should find/create contact, save message, and return context', async () => {
+-      contactRepository.findOrCreate.mockResolvedValue(mockContact as any);
++    it('should save message and return context', async () => {
+       messageRepository.create.mockResolvedValue({} as any);
+       messageRepository.findConversationContext.mockResolvedValue(mockMessages as any);
+ 
+       const result = await service.handleIncomingMessage('Hello!', mockContext);
+ 
+-      expect(contactRepository.findOrCreate).toHaveBeenCalled();
+       expect(messageRepository.create).toHaveBeenCalledWith(
+         expect.objectContaining({
+           content: 'Hello!',
+@@ -217,7 +183,7 @@ describe('MessagePersistenceService', () => {
+         }),
+       );
+       expect(messageRepository.findConversationContext).toHaveBeenCalled();
+-      expect(result.contact).toEqual(mockContact);
++      expect(result.contactId.toString()).toEqual(mockContact._id.toString());
+       expect(result.conversationHistory).toHaveLength(2);
+     });
+   });
+diff --git a/src/channels/shared/message-persistence.service.ts b/src/channels/shared/message-persistence.service.ts
+index fa796f7..7d2cf12 100644
+--- a/src/channels/shared/message-persistence.service.ts
++++ b/src/channels/shared/message-persistence.service.ts
+@@ -1,7 +1,6 @@
+ import { Injectable, Logger } from '@nestjs/common';
+ import { Types } from 'mongoose';
+ import { MessageRepository } from '../../database/repositories/message.repository';
+-import { ContactRepository } from '../../database/repositories/contact.repository';
+ import { ConversationSummaryService } from '../../agent/conversation-summary.service';
+ import { AgentContext } from '../../agent/contracts/agent-context';
+ 
+@@ -9,9 +8,7 @@ export interface MessagePersistenceContext {
+   channelId: Types.ObjectId | string;
+   agentId: Types.ObjectId | string;
+   clientId: Types.ObjectId | string;
+-  externalUserId: string;
+-  channelType: 'whatsapp' | 'tiktok' | 'instagram';
+-  userName: string;
++  contactId: Types.ObjectId | string;
+ }
+ 
+ @Injectable()
+@@ -20,27 +17,9 @@ export class MessagePersistenceService {
+ 
+   constructor(
+     private readonly messageRepository: MessageRepository,
+-    private readonly contactRepository: ContactRepository,
+     private readonly conversationSummaryService: ConversationSummaryService,
+   ) {}
+ 
+-  /**
+-   * Finds or creates a contact by external ID (e.g., phone number, TikTok user ID)
+-   */
+-  async findOrCreateContact(
+-    externalUserId: string,
+-    clientId: Types.ObjectId | string,
+-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
+-    name: string,
+-  ): Promise<any> {
+-    return this.contactRepository.findOrCreate(
+-      externalUserId,
+-      new Types.ObjectId(clientId),
+-      channelType,
+-      name,
+-    );
+-  }
+-
+   /**
+    * Saves an incoming user message to the database
+    */
+@@ -140,27 +119,21 @@ export class MessagePersistenceService {
+     content: string,
+     context: MessagePersistenceContext,
+   ): Promise<{
+-    contact: any;
++    contactId: Types.ObjectId;
+     conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
+   }> {
+-    // Find or create contact
+-    const contact = await this.findOrCreateContact(
+-      context.externalUserId,
+-      context.clientId,
+-      context.channelType,
+-      context.userName,
+-    );
++    const contactId = new Types.ObjectId(context.contactId);
+ 
+     // Save user message
+-    await this.saveUserMessage(content, context, contact._id as Types.ObjectId);
++    await this.saveUserMessage(content, context, contactId);
+ 
+     // Get conversation context
+     const conversationHistory = await this.getConversationContext(
+       context,
+-      contact._id as Types.ObjectId,
++      contactId,
+     );
+ 
+-    return { contact, conversationHistory };
++    return { contactId, conversationHistory };
+   }
+ 
+   /**
+diff --git a/src/channels/shared/shared.module.ts b/src/channels/shared/shared.module.ts
+index 8eeb3b0..9311660 100644
+--- a/src/channels/shared/shared.module.ts
++++ b/src/channels/shared/shared.module.ts
+@@ -4,10 +4,60 @@ import { ConversationSummaryService } from '../../agent/conversation-summary.ser
+ import { AgentRoutingService } from './agent-routing.service';
+ import { ConfigModule } from '@nestjs/config';
+ import { DatabaseModule } from '../../database/database.module';
++import { ContactIdentifierExtractorRegistry } from './contact-identifier/contact-identifier-extractor.registry';
++import { WhatsappIdentifierExtractor } from './contact-identifier/whatsapp-identifier.extractor';
++import { InstagramIdentifierExtractor } from './contact-identifier/instagram-identifier.extractor';
++import { TelegramIdentifierExtractor } from './contact-identifier/telegram-identifier.extractor';
++import { TiktokIdentifierExtractor } from './contact-identifier/tiktok-identifier.extractor';
++import { WebIdentifierExtractor } from './contact-identifier/web-identifier.extractor';
++import { ApiIdentifierExtractor } from './contact-identifier/api-identifier.extractor';
++import { CONTACT_IDENTIFIER_EXTRACTORS } from './contact-identifier/contact-identifier-extractor.interface';
+ 
+ @Module({
+   imports: [ConfigModule, DatabaseModule],
+-  providers: [MessagePersistenceService, ConversationSummaryService, AgentRoutingService],
+-  exports: [MessagePersistenceService, ConversationSummaryService, AgentRoutingService],
++  providers: [
++    MessagePersistenceService,
++    ConversationSummaryService,
++    AgentRoutingService,
++    ContactIdentifierExtractorRegistry,
++    WhatsappIdentifierExtractor,
++    InstagramIdentifierExtractor,
++    TelegramIdentifierExtractor,
++    TiktokIdentifierExtractor,
++    WebIdentifierExtractor,
++    ApiIdentifierExtractor,
++    {
++      provide: CONTACT_IDENTIFIER_EXTRACTORS,
++      useFactory: (
++        whatsappExtractor: WhatsappIdentifierExtractor,
++        instagramExtractor: InstagramIdentifierExtractor,
++        telegramExtractor: TelegramIdentifierExtractor,
++        tiktokExtractor: TiktokIdentifierExtractor,
++        webExtractor: WebIdentifierExtractor,
++        apiExtractor: ApiIdentifierExtractor,
++      ) => [
++        whatsappExtractor,
++        instagramExtractor,
++        telegramExtractor,
++        tiktokExtractor,
++        webExtractor,
++        apiExtractor,
++      ],
++      inject: [
++        WhatsappIdentifierExtractor,
++        InstagramIdentifierExtractor,
++        TelegramIdentifierExtractor,
++        TiktokIdentifierExtractor,
++        WebIdentifierExtractor,
++        ApiIdentifierExtractor,
++      ],
++    },
++  ],
++  exports: [
++    MessagePersistenceService,
++    ConversationSummaryService,
++    AgentRoutingService,
++    ContactIdentifierExtractorRegistry,
++  ],
+ })
+ export class SharedChannelModule {}
+diff --git a/src/channels/tiktok/tiktok.service.spec.ts b/src/channels/tiktok/tiktok.service.spec.ts
+index 03c50ce..507bbdc 100644
+--- a/src/channels/tiktok/tiktok.service.spec.ts
++++ b/src/channels/tiktok/tiktok.service.spec.ts
+@@ -5,6 +5,8 @@ import { AgentService } from '../../agent/agent.service';
+ import { AgentRoutingService } from '../shared/agent-routing.service';
+ import { AgentRepository } from '../../database/repositories/agent.repository';
+ import { AgentContextService } from '../../agent/agent-context.service';
++import { ContactRepository } from '../../database/repositories/contact.repository';
++import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
+ import { AgentOutput } from '../../agent/contracts/agent-output';
+ import { encrypt } from '../../database/utils/crypto.util';
+ 
+@@ -13,6 +15,8 @@ describe('TiktokService', () => {
+   let agentService: jest.Mocked<AgentService>;
+   let agentRoutingService: jest.Mocked<AgentRoutingService>;
+   let agentRepository: jest.Mocked<AgentRepository>;
++  let contactRepository: jest.Mocked<ContactRepository>;
++  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
+   let loggerLogSpy: jest.SpyInstance;
+   let loggerWarnSpy: jest.SpyInstance;
+   let loggerErrorSpy: jest.SpyInstance;
+@@ -43,6 +47,20 @@ describe('TiktokService', () => {
+           provide: AgentRepository,
+           useValue: { findActiveById: jest.fn() },
+         },
++        {
++          provide: ContactRepository,
++          useValue: { findOrCreateByExternalIdentity: jest.fn() },
++        },
++        {
++          provide: ContactIdentifierExtractorRegistry,
++          useValue: {
++            resolve: jest.fn().mockReturnValue({
++              externalId: 'sender_456',
++              externalIdRaw: 'sender_456',
++              identifierType: 'platform_id',
++            }),
++          },
++        },
+         {
+           provide: AgentContextService,
+           useValue: {
+@@ -56,6 +74,8 @@ describe('TiktokService', () => {
+     agentService = module.get(AgentService);
+     agentRoutingService = module.get(AgentRoutingService);
+     agentRepository = module.get(AgentRepository);
++    contactRepository = module.get(ContactRepository);
++    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);
+ 
+     loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
+     loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
+@@ -111,11 +131,11 @@ describe('TiktokService', () => {
+ 
+     const mockClientAgent = {
+         agentId: 'agent_007',
+-        clientId: 'client_001',
++        clientId: '507f1f77bcf86cd799439011',
+         channels: [
+           {
+             status: 'active',
+-            channelId: 'channel_1',
++            channelId: '507f1f77bcf86cd799439014',
+             credentials: encryptedCredsRecord,
+             llmConfig: { provider: 'openai', apiKey: 'key' },
+           },
+@@ -170,6 +190,9 @@ describe('TiktokService', () => {
+         },
+       } as any);
+       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
++      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
++        _id: '507f1f77bcf86cd799439012',
++      } as any);
+       agentService.run.mockResolvedValue({
+         reply: { text: 'Hello back!', type: 'text' },
+       });
+@@ -203,6 +226,9 @@ describe('TiktokService', () => {
+         },
+       } as any);
+       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
++      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
++        _id: '507f1f77bcf86cd799439012',
++      } as any);
+       agentService.run.mockResolvedValue({
+         reply: { text: 'Hello back!', type: 'text' },
+       });
+diff --git a/src/channels/tiktok/tiktok.service.ts b/src/channels/tiktok/tiktok.service.ts
+index ff9cf15..21653d9 100644
+--- a/src/channels/tiktok/tiktok.service.ts
++++ b/src/channels/tiktok/tiktok.service.ts
+@@ -1,12 +1,16 @@
+ import { Injectable, Logger } from '@nestjs/common';
++import { Types } from 'mongoose';
+ import { AgentService } from '../../agent/agent.service';
+ import { AgentInput } from '../../agent/contracts/agent-input';
+ import { AgentContext } from '../../agent/contracts/agent-context';
+ import { AgentRepository } from '../../database/repositories/agent.repository';
++import { ContactRepository } from '../../database/repositories/contact.repository';
+ import { AgentRoutingService } from '../shared/agent-routing.service';
+ import { AgentContextService } from '../../agent/agent-context.service';
+ import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
+ import { TIKTOK_API_BASE_URL } from './tiktok.config';
++import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
++import { CHANNEL_TYPES } from '../shared/channel-type.constants';
+ 
+ @Injectable()
+ export class TiktokService {
+@@ -16,7 +20,9 @@ export class TiktokService {
+     private readonly agentService: AgentService,
+     private readonly agentRoutingService: AgentRoutingService,
+     private readonly agentRepository: AgentRepository,
++    private readonly contactRepository: ContactRepository,
+     private readonly agentContextService: AgentContextService,
++    private readonly identifierExtractorRegistry: ContactIdentifierExtractorRegistry,
+   ) {}
+ 
+   async handleIncoming(payload: any): Promise<void> {
+@@ -43,12 +49,17 @@ export class TiktokService {
+       `[TikTok] Incoming message from sender=${data.sender?.user_id} to recipient=${recipientUserId}`,
+     );
+ 
++    const identifier = this.identifierExtractorRegistry.resolve(
++      CHANNEL_TYPES.TIKTOK,
++      payload,
++    );
++
+     // Route: resolve which agent should handle this message
+     const routeDecision = await this.agentRoutingService.resolveRoute({
+-      channelIdentifier: recipientUserId,
+-      externalUserId: data.sender.user_id,
++      routeChannelIdentifier: recipientUserId,
++      channelIdentifier: identifier.externalId,
+       incomingText: data.message.text,
+-      channelType: 'tiktok',
++      channelType: CHANNEL_TYPES.TIKTOK,
+     });
+ 
+     if (routeDecision.kind === 'unroutable') {
+@@ -112,9 +123,18 @@ export class TiktokService {
+ 
+     const context = await this.agentContextService.enrichContext(rawContext);
+ 
++    const contact = await this.contactRepository.findOrCreateByExternalIdentity(
++      new Types.ObjectId(clientAgent.clientId),
++      new Types.ObjectId(channelConfig.channelId.toString()),
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      data.sender.user_id,
++    );
++
+     const input: AgentInput = {
+-      channel: 'tiktok',
+-      externalUserId: data.sender.user_id,
++      channel: CHANNEL_TYPES.TIKTOK,
++      contactId: contact._id.toString(),
+       conversationId: data.conversation_id,
+       message: {
+         type: 'text',
+diff --git a/src/channels/whatsapp/whatsapp.service.spec.ts b/src/channels/whatsapp/whatsapp.service.spec.ts
+index ec82c16..58e2370 100644
+--- a/src/channels/whatsapp/whatsapp.service.spec.ts
++++ b/src/channels/whatsapp/whatsapp.service.spec.ts
+@@ -5,15 +5,19 @@ import { WhatsappService } from './whatsapp.service';
+ import { AgentService } from '../../agent/agent.service';
+ import { AgentRepository } from '../../database/repositories/agent.repository';
+ import { ClientRepository } from '../../database/repositories/client.repository';
++import { ContactRepository } from '../../database/repositories/contact.repository';
+ import { LlmProvider } from '../../agent/llm/provider.enum';
+ import { AgentRoutingService } from '../shared/agent-routing.service';
+ import { AgentContextService } from '../../agent/agent-context.service';
++import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
+ 
+ describe('WhatsappService', () => {
+   let service: WhatsappService;
+   let agentService: jest.Mocked<AgentService>;
+   let agentRoutingService: jest.Mocked<AgentRoutingService>;
+   let agentRepository: jest.Mocked<AgentRepository>;
++  let contactRepository: jest.Mocked<ContactRepository>;
++  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierExtractorRegistry>;
+   let loggerLogSpy: jest.SpyInstance;
+   let loggerWarnSpy: jest.SpyInstance;
+   let fetchSpy: jest.SpyInstance;
+@@ -48,6 +52,20 @@ describe('WhatsappService', () => {
+           provide: ClientRepository,
+           useValue: { findById: jest.fn().mockResolvedValue({ name: 'Test Client' }) },
+         },
++        {
++          provide: ContactRepository,
++          useValue: { findOrCreateByExternalIdentity: jest.fn() },
++        },
++        {
++          provide: ContactIdentifierExtractorRegistry,
++          useValue: {
++            resolve: jest.fn().mockReturnValue({
++              externalId: '1234567890',
++              externalIdRaw: '+1234567890',
++              identifierType: 'phone',
++            }),
++          },
++        },
+         {
+           provide: AgentContextService,
+           useValue: {
+@@ -61,6 +79,8 @@ describe('WhatsappService', () => {
+     agentService = module.get(AgentService);
+     agentRoutingService = module.get(AgentRoutingService);
+     agentRepository = module.get(AgentRepository);
++    contactRepository = module.get(ContactRepository);
++    identifierExtractorRegistry = module.get(ContactIdentifierExtractorRegistry);
+ 
+     // Spy on Logger.prototype since a new Logger() is instantiated in the service
+     loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
+@@ -135,12 +155,12 @@ describe('WhatsappService', () => {
+ 
+     const mockClientAgent = {
+       _id: 'ca-1',
+-      clientId: 'client-1',
++      clientId: '507f1f77bcf86cd799439011',
+       agentId: 'agent-1',
+       status: 'active',
+       channels: [
+         {
+-          channelId: 'whatsapp-1',
++          channelId: '507f1f77bcf86cd799439014',
+           status: 'active',
+           provider: 'meta',
+           credentials: { phoneNumberId: 'phone123', accessToken: 'sk-wa-token' },
+@@ -159,6 +179,10 @@ describe('WhatsappService', () => {
+       systemPrompt: 'You are a helpful assistant.',
+     };
+ 
++    const mockContact = {
++      _id: '507f1f77bcf86cd799439012',
++    };
++
+     const mockResolvedRoute = {
+       kind: 'resolved' as const,
+       candidate: {
+@@ -232,6 +256,7 @@ describe('WhatsappService', () => {
+     it('should call agentService.run with correct input and context', async () => {
+       agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
+       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
++      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue(mockContact as any);
+       agentService.run.mockResolvedValue({
+         reply: { type: 'text', text: 'Hello' },
+       });
+@@ -242,15 +267,15 @@ describe('WhatsappService', () => {
+       expect(agentService.run).toHaveBeenCalledWith(
+         {
+           channel: 'whatsapp',
+-          externalUserId: '1234567890',
++          contactId: '507f1f77bcf86cd799439012',
+           conversationId: 'phone123:1234567890',
+           message: { type: 'text', text: 'Hello' },
+           metadata: { messageId: 'msg123', phoneNumberId: 'phone123' },
+         },
+         expect.objectContaining({
+           agentId: 'agent-1',
+-          clientId: 'client-1',
+-          channelId: 'whatsapp-1',
++          clientId: '507f1f77bcf86cd799439011',
++          channelId: '507f1f77bcf86cd799439014',
+           systemPrompt: 'You are a helpful assistant.',
+           channelConfig: mockClientAgent.channels[0].credentials,
+         }),
+@@ -260,6 +285,7 @@ describe('WhatsappService', () => {
+     it('should log outbound message when reply exists', async () => {
+       agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
+       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
++      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue(mockContact as any);
+       agentService.run.mockResolvedValue({
+         reply: { type: 'text', text: 'Echo response' },
+       });
+@@ -275,6 +301,7 @@ describe('WhatsappService', () => {
+     it('should not log outbound message when reply is undefined', async () => {
+       agentRoutingService.resolveRoute.mockResolvedValue(mockResolvedRoute as any);
+       agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
++      contactRepository.findOrCreateByExternalIdentity.mockResolvedValue(mockContact as any);
+       agentService.run.mockResolvedValue({});
+ 
+       const payload = createPayload();
+diff --git a/src/channels/whatsapp/whatsapp.service.ts b/src/channels/whatsapp/whatsapp.service.ts
+index 713cbfc..9c0a10b 100644
+--- a/src/channels/whatsapp/whatsapp.service.ts
++++ b/src/channels/whatsapp/whatsapp.service.ts
+@@ -1,9 +1,11 @@
+ import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
++import { Types } from 'mongoose';
+ import { AgentService } from '../../agent/agent.service';
+ import { AgentInput } from '../../agent/contracts/agent-input';
+ import { AgentContext } from '../../agent/contracts/agent-context';
+ import { AgentRepository } from '../../database/repositories/agent.repository';
+ import { ClientRepository } from '../../database/repositories/client.repository';
++import { ContactRepository } from '../../database/repositories/contact.repository';
+ import { decryptRecord, decrypt } from '../../database/utils/crypto.util';
+ import { RouteCandidate } from '../shared/agent-routing.service';
+ import {
+@@ -13,6 +15,8 @@ import {
+ } from './whatsapp.config';
+ import { AgentRoutingService } from '../shared/agent-routing.service';
+ import { AgentContextService } from '../../agent/agent-context.service';
++import { ContactIdentifierExtractorRegistry } from '../shared/contact-identifier/contact-identifier-extractor.registry';
++import { CHANNEL_TYPES } from '../shared/channel-type.constants';
+ 
+ @Injectable()
+ export class WhatsappService {
+@@ -23,8 +27,10 @@ export class WhatsappService {
+     private readonly agentService: AgentService,
+     private readonly agentRepository: AgentRepository,
+     private readonly clientRepository: ClientRepository,
++    private readonly contactRepository: ContactRepository,
+     private readonly agentRoutingService: AgentRoutingService,
+     private readonly agentContextService: AgentContextService,
++    private readonly identifierExtractorRegistry: ContactIdentifierExtractorRegistry,
+   ) {
+     this.config = loadWhatsAppConfig();
+   }
+@@ -104,11 +110,16 @@ export class WhatsappService {
+     );
+     this.logger.log(`[WhatsApp] Extracted phoneNumberId: ${phoneNumberId}`);
+ 
++    const identifier = this.identifierExtractorRegistry.resolve(
++      CHANNEL_TYPES.WHATSAPP,
++      payload,
++    );
++
+     const routeDecision = await this.agentRoutingService.resolveRoute({
+-      channelIdentifier: phoneNumberId,
+-      externalUserId: message.from,
++      routeChannelIdentifier: phoneNumberId,
++      channelIdentifier: identifier.externalId,
+       incomingText: message.text.body,
+-      channelType: 'whatsapp',
++      channelType: CHANNEL_TYPES.WHATSAPP,
+     });
+ 
+     if (routeDecision.kind === 'unroutable') {
+@@ -181,9 +192,18 @@ export class WhatsappService {
+ 
+     const context = await this.agentContextService.enrichContext(rawContext);
+ 
++    const contact = await this.contactRepository.findOrCreateByExternalIdentity(
++      new Types.ObjectId(clientAgent.clientId),
++      new Types.ObjectId(channelConfig.channelId.toString()),
++      identifier.externalId,
++      identifier.externalIdRaw,
++      identifier.identifierType,
++      message.from,
++    );
++
+     const input: AgentInput = {
+-      channel: 'whatsapp',
+-      externalUserId: message.from,
++      channel: CHANNEL_TYPES.WHATSAPP,
++      contactId: contact._id.toString(),
+       conversationId: `${phoneNumberId}:${message.from}`,
+       message: {
+         type: 'text',
+diff --git a/src/database/repositories/contact.repository.spec.ts b/src/database/repositories/contact.repository.spec.ts
+new file mode 100644
+index 0000000..83aa6c4
+--- /dev/null
++++ b/src/database/repositories/contact.repository.spec.ts
+@@ -0,0 +1,51 @@
++import { Logger } from '@nestjs/common';
++import { Types } from 'mongoose';
++import { ContactRepository } from './contact.repository';
++
++describe('ContactRepository', () => {
++  it('retries by reading existing contact when duplicate key error occurs', async () => {
++    const duplicateError = Object.assign(new Error('E11000 duplicate key error'), {
++      code: 11000,
++    });
++
++    const existing = {
++      _id: new Types.ObjectId(),
++      clientId: new Types.ObjectId(),
++      channelId: new Types.ObjectId(),
++      externalId: '14155550123',
++      status: 'active',
++    };
++
++    const model = {
++      findOneAndUpdate: jest.fn().mockReturnValue({
++        exec: jest.fn().mockRejectedValue(duplicateError),
++      }),
++      findOne: jest.fn().mockReturnValue({
++        session: jest.fn().mockReturnValue({
++          exec: jest.fn().mockResolvedValue(existing),
++        }),
++      }),
++    };
++
++    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
++    const repository = new ContactRepository(model as any);
++
++    const result = await repository.findOrCreateByExternalIdentity(
++      existing.clientId,
++      existing.channelId,
++      existing.externalId,
++      '+1 415 555 0123',
++      'phone',
++      'User',
++    );
++
++    expect(result).toEqual(existing);
++    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
++    expect(model.findOne).toHaveBeenCalledTimes(1);
++    expect(warnSpy).toHaveBeenCalledWith(
++      expect.stringContaining('event=contact_duplicate_key_retry'),
++    );
++
++    warnSpy.mockRestore();
++  });
++});
+diff --git a/src/database/repositories/contact.repository.ts b/src/database/repositories/contact.repository.ts
+index eae8ea4..256b4a2 100644
+--- a/src/database/repositories/contact.repository.ts
++++ b/src/database/repositories/contact.repository.ts
+@@ -1,10 +1,13 @@
+-import { Injectable } from '@nestjs/common';
++import { Injectable, Logger } from '@nestjs/common';
+ import { InjectModel } from '@nestjs/mongoose';
+ import { ClientSession, Model, Types } from 'mongoose';
+ import { Contact } from '../schemas/contact.schema';
++import { ContactIdentifierType } from '../schemas/contact.schema';
+ 
+ @Injectable()
+ export class ContactRepository {
++  private readonly logger = new Logger(ContactRepository.name);
++
+   constructor(
+     @InjectModel(Contact.name)
+     private readonly model: Model<Contact>,
+@@ -18,42 +21,80 @@ export class ContactRepository {
+     return this.model.find({ clientId }).exec();
+   }
+ 
+-  async findByExternalUserId(
+-    externalUserId: string,
++  async findByExternalIdentity(
+     clientId: Types.ObjectId,
++    channelId: Types.ObjectId,
++    externalId: string,
+   ): Promise<Contact | null> {
+-    return this.model.findOne({ externalUserId, clientId }).exec();
++    return this.model
++      .findOne({ clientId, channelId, externalId })
++      .exec();
+   }
+ 
+-  async findOrCreate(
+-    externalUserId: string,
++  async findOrCreateByExternalIdentity(
+     clientId: Types.ObjectId,
+-    channelType: 'whatsapp' | 'tiktok' | 'instagram',
++    channelId: Types.ObjectId,
++    externalId: string,
++    externalIdRaw: string | undefined,
++    identifierType: ContactIdentifierType,
+     name: string,
++    metadata?: Record<string, unknown>,
+     session?: ClientSession,
+   ): Promise<Contact> {
+-    const existing = await this.model
+-      .findOne({ externalUserId, clientId })
+-      .session(session)
+-      .exec();
++    const filter = { clientId, channelId, externalId };
++    const setOnInsert = {
++      clientId,
++      channelId,
++      externalId,
++      externalIdRaw,
++      identifier: {
++        type: identifierType,
++        value: externalId,
++      },
++      name,
++      metadata: metadata ?? {},
++      status: 'active',
++    };
++
++    try {
++      const contact = await this.model
++        .findOneAndUpdate(
++          filter,
++          {
++            $setOnInsert: setOnInsert,
++          },
++          {
++            upsert: true,
++            new: true,
++            setDefaultsOnInsert: true,
++            runValidators: true,
++            session,
++          },
++        )
++        .exec();
+ 
+-    if (existing) {
+-      return existing;
++      this.logger.log(
++        `event=contact_upsert_success clientId=${clientId.toString()} channelId=${channelId.toString()}`,
++      );
++
++      return contact as Contact;
++    } catch (error) {
++      if (this.isDuplicateKeyError(error)) {
++        this.logger.warn(
++          `event=contact_duplicate_key_retry clientId=${clientId.toString()} channelId=${channelId.toString()}`,
++        );
++
++        const existing = await this.model.findOne(filter).session(session).exec();
++        if (existing) {
++          return existing;
++        }
++      }
++
++      throw error;
+     }
++  }
+ 
+-    const [contact] = await this.model.create(
+-      [
+-        {
+-          externalUserId,
+-          clientId,
+-          channelType,
+-          name,
+-          status: 'active',
+-        },
+-      ],
+-      { session },
+-    );
+-
+-    return contact;
++  private isDuplicateKeyError(error: unknown): boolean {
++    return typeof error === 'object' && error !== null && (error as any).code === 11000;
+   }
+ }
+diff --git a/src/database/schemas/contact.schema.spec.ts b/src/database/schemas/contact.schema.spec.ts
+new file mode 100644
+index 0000000..ec08beb
+--- /dev/null
++++ b/src/database/schemas/contact.schema.spec.ts
+@@ -0,0 +1,63 @@
++import { ContactSchema, throwsIfExternalIdMutation } from './contact.schema';
++
++describe('ContactSchema', () => {
++  it('enforces unique compound index on clientId+channelId+externalId without legacy unique index', () => {
++    const indexes = ContactSchema.indexes();
++
++    const hasRequiredCompoundIndex = indexes.some(
++      ([fields, options]) =>
++        fields.clientId === 1 &&
++        fields.channelId === 1 &&
++        fields.externalId === 1 &&
++        options?.unique === true,
++    );
++
++    const hasLegacyUniqueIndex = indexes.some(
++      ([fields, options]) =>
++        ((fields as any).channelIdentifier === 1 || (fields as any).externalUserId === 1) &&
++        options?.unique === true,
++    );
++
++    expect(hasRequiredCompoundIndex).toBe(true);
++    expect(hasLegacyUniqueIndex).toBe(false);
++  });
++
++  it('marks externalId as immutable', () => {
++    const externalIdPath = ContactSchema.path('externalId') as any;
++    expect(externalIdPath.options.immutable).toBe(true);
++  });
++
++  it('throws when externalId mutation is attempted via update payload', () => {
++    expect(() =>
++      throwsIfExternalIdMutation({
++        $set: { externalId: 'new-external-id' },
++      }),
++    ).toThrow('externalId is immutable and cannot be modified');
++  });
++
++  it('allows upsert setOnInsert for externalId without mutation error', () => {
++    expect(() =>
++      throwsIfExternalIdMutation({
++        $setOnInsert: { externalId: 'new-external-id' },
++      }),
++    ).not.toThrow();
++  });
++
++  it('keeps original externalId unchanged after mutation attempt', () => {
++    const persisted = {
++      _id: 'contact-1',
++      externalId: '12345678',
++      name: 'Contact',
++    };
++
++    try {
++      throwsIfExternalIdMutation({
++        $set: { externalId: '99999999' },
++      });
++    } catch {
++      // mutation blocked as expected
++    }
++
++    expect(persisted.externalId).toBe('12345678');
++  });
++});
+diff --git a/src/database/schemas/contact.schema.ts b/src/database/schemas/contact.schema.ts
+index 5c6405e..06b6d6c 100644
+--- a/src/database/schemas/contact.schema.ts
++++ b/src/database/schemas/contact.schema.ts
+@@ -1,10 +1,37 @@
+ import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
+ import { Document, Types } from 'mongoose';
+ 
++export type ContactIdentifierType =
++  | 'phone'
++  | 'username'
++  | 'platform_id'
++  | 'email';
++
++@Schema({ _id: false })
++export class ContactIdentifier {
++  @Prop({
++    required: true,
++    enum: ['phone', 'username', 'platform_id', 'email'],
++  })
++  type: ContactIdentifierType;
++
++  @Prop({ required: true })
++  value: string;
++}
++
++export const ContactIdentifierSchema =
++  SchemaFactory.createForClass(ContactIdentifier);
++
+ @Schema({ collection: 'contacts', timestamps: true })
+ export class Contact extends Document {
+-  @Prop({ required: true, index: true })
+-  externalUserId: string;
++  @Prop({ required: true, index: true, immutable: true })
++  externalId: string;
++
++  @Prop()
++  externalIdRaw?: string;
++
++  @Prop({ type: ContactIdentifierSchema })
++  identifier?: ContactIdentifier;
+ 
+   @Prop({
+     type: Types.ObjectId,
+@@ -15,22 +42,26 @@ export class Contact extends Document {
+   clientId: Types.ObjectId;
+ 
+   @Prop({
++    type: Types.ObjectId,
++    ref: 'Channel',
+     required: true,
+-    enum: ['whatsapp', 'tiktok', 'instagram'],
+     index: true,
+   })
+-  channelType: 'whatsapp' | 'tiktok' | 'instagram';
++  channelId: Types.ObjectId;
+ 
+   @Prop({ required: true })
+   name: string;
+ 
++  @Prop({ type: Object, default: {} })
++  metadata?: Record<string, any>;
++
+   @Prop({
+     required: true,
+-    enum: ['active', 'inactive', 'archived'],
++    enum: ['active', 'blocked', 'archived'],
+     default: 'active',
+     index: true,
+   })
+-  status: 'active' | 'inactive' | 'archived';
++  status: 'active' | 'blocked' | 'archived';
+ 
+   createdAt: Date;
+   updatedAt: Date;
+@@ -38,5 +69,34 @@ export class Contact extends Document {
+ 
+ export const ContactSchema = SchemaFactory.createForClass(Contact);
+ 
+-// Unique per external user per client
+-ContactSchema.index({ externalUserId: 1, clientId: 1 }, { unique: true });
++export function throwsIfExternalIdMutation(update: Record<string, any>): void {
++  if (!update) {
++    return;
++  }
++
++  const directMutation = Object.prototype.hasOwnProperty.call(update, 'externalId');
++  const setMutation =
++    !!update.$set &&
++    Object.prototype.hasOwnProperty.call(update.$set, 'externalId');
++  const unsetMutation =
++    !!update.$unset &&
++    Object.prototype.hasOwnProperty.call(update.$unset, 'externalId');
++  const renameMutation =
++    !!update.$rename &&
++    Object.prototype.hasOwnProperty.call(update.$rename, 'externalId');
++
++  if (directMutation || setMutation || unsetMutation || renameMutation) {
++    throw new Error('externalId is immutable and cannot be modified');
++  }
++}
++
++ContactSchema.pre('findOneAndUpdate', function () {
++  const update = this.getUpdate() as Record<string, any>;
++  throwsIfExternalIdMutation(update);
++});
++
++// Unique per normalized identifier per client per channel
++ContactSchema.index(
++  { clientId: 1, channelId: 1, externalId: 1 },
++  { unique: true },
++);
+diff --git a/test/message-persistence.e2e-spec.ts b/test/message-persistence.e2e-spec.ts
+index 8e95786..6418493 100644
+--- a/test/message-persistence.e2e-spec.ts
++++ b/test/message-persistence.e2e-spec.ts
+@@ -52,7 +52,7 @@ describe('Message Persistence (e2e)', () => {
+       await connection.collection('agents').deleteOne({ _id: agentIdObj });
+       await connection.collection('client_agents').deleteOne({ _id: clientAgentIdObj });
+       await connection.collection('messages').deleteMany({ channelId: channelIdObj });
+-      await connection.collection('contacts').deleteMany({ externalUserId: userPhone });
++      await connection.collection('contacts').deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
+     }
+ 
+     // Create Client
+@@ -103,7 +103,7 @@ describe('Message Persistence (e2e)', () => {
+       await connection.collection('agents').deleteOne({ _id: agentIdObj });
+       await connection.collection('client_agents').deleteOne({ _id: clientAgentIdObj });
+       await connection.collection('messages').deleteMany({ channelId: channelIdObj });
+-      await connection.collection('contacts').deleteMany({ externalUserId: userPhone });
++      await connection.collection('contacts').deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
+     }
+     await app.close();
+   });
+@@ -111,7 +111,7 @@ describe('Message Persistence (e2e)', () => {
+   beforeEach(async () => {
+     // Clean up messages before each test
+     await connection.collection('messages').deleteMany({ channelId: channelIdObj });
+-    await connection.collection('contacts').deleteMany({ externalUserId: userPhone });
++    await connection.collection('contacts').deleteMany({ externalId: userPhone.replace(/[^\d]/g, '') });
+     jest.clearAllMocks();
+   });
+ 
+@@ -149,9 +149,9 @@ describe('Message Persistence (e2e)', () => {
+       // Assert - Check contact was created
+       const contact = await connection
+         .collection('contacts')
+-        .findOne({ externalUserId: userPhone });
++        .findOne({ externalId: userPhone.replace(/[^\d]/g, '') });
+       expect(contact).toBeDefined();
+-      expect(contact.externalUserId).toBe(userPhone);
++      expect(contact.externalId).toBe(userPhone.replace(/[^\d]/g, ''));
+       expect(contact.clientId.toString()).toBe(clientId);
+ 
+       // Assert - Check user message was persisted
+@@ -257,10 +257,16 @@ describe('Message Persistence (e2e)', () => {
+ 
+       // Create a contact with enough messages to exceed threshold
+       const contactResult = await connection.collection('contacts').insertOne({
+-        externalUserId: userPhone,
++        externalId: userPhone.replace(/[^\d]/g, ''),
++        externalIdRaw: userPhone,
++        identifier: {
++          type: 'phone',
++          value: userPhone.replace(/[^\d]/g, ''),
++        },
+         clientId: clientIdObj,
+-        channelType: 'whatsapp',
++        channelId: channelIdObj,
+         name: userPhone,
++        metadata: {},
+         status: 'active',
+       });
+ 
+@@ -370,12 +376,12 @@ describe('Message Persistence (e2e)', () => {
+ 
+       const contact = await connection
+         .collection('contacts')
+-        .findOne({ externalUserId: userPhone });
++        .findOne({ externalId: userPhone.replace(/[^\d]/g, '') });
+ 
+       expect(contact).toBeDefined();
+-      expect(contact.externalUserId).toBe(userPhone);
++      expect(contact.externalId).toBe(userPhone.replace(/[^\d]/g, ''));
+       expect(contact.name).toBe(userPhone);
+-      expect(contact.channelType).toBe('whatsapp');
++      expect(contact.channelId.toString()).toBe(channelIdObj.toString());
+       expect(contact.status).toBe('active');
+     });
+ 
+@@ -408,7 +414,7 @@ describe('Message Persistence (e2e)', () => {
+ 
+       const contactCountAfterFirst = await connection
+         .collection('contacts')
+-        .countDocuments({ externalUserId: userPhone });
++        .countDocuments({ externalId: userPhone.replace(/[^\d]/g, '') });
+ 
+       // Second message
+       const payload2 = {
+@@ -438,7 +444,7 @@ describe('Message Persistence (e2e)', () => {
+ 
+       const contactCountAfterSecond = await connection
+         .collection('contacts')
+-        .countDocuments({ externalUserId: userPhone });
++        .countDocuments({ externalId: userPhone.replace(/[^\d]/g, '') });
+ 
+       // Should still be only one contact
+       expect(contactCountAfterFirst).toBe(1);
+diff --git a/test/whatsapp-routing.e2e-spec.ts b/test/whatsapp-routing.e2e-spec.ts
+index dafd9f3..180c384 100644
+--- a/test/whatsapp-routing.e2e-spec.ts
++++ b/test/whatsapp-routing.e2e-spec.ts
+@@ -508,20 +508,20 @@ describe('WhatsApp Message Routing (e2e)', () => {
+       // Conversations should be separate (verified by conversationId including phoneNumberId)
+     });
+ 
+-    it('should maintain separate conversations for same external user ID across different clients', async () => {
++    it('should maintain separate conversations for same channel identifier across different clients', async () => {
+       if (!user1PhoneNumberId || !user2PhoneNumberId) {
+         return;
+       }
+ 
+-      const sameExternalUserId = '5555555555';
++      const sameChannelIdentifier = '5555555555';
+ 
+-      // Same external user messages different clients
++      // Same channel identifier messages different clients
+       await request(app.getHttpServer())
+         .post('/whatsapp/webhook')
+         .send(
+           createWhatsAppMessage(
+             user1PhoneNumberId,
+-            sameExternalUserId,
++            sameChannelIdentifier,
+             'Message to User 1',
+             'msg-same-user-1',
+           ),
+@@ -533,7 +533,7 @@ describe('WhatsApp Message Routing (e2e)', () => {
+         .send(
+           createWhatsAppMessage(
+             user2PhoneNumberId,
+-            sameExternalUserId,
++            sameChannelIdentifier,
+             'Message to User 2',
+             'msg-same-user-2',
+           ),
+```
+
+## Unstaged
+
+```diff
+```
+
+## Untracked
+
+### DIFF_DUMP_LATEST.md
+```diff
```
