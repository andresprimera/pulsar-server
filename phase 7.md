# Phase 7 Changes

Generated: 2026-02-28 17:45:46 UTC

```diff
diff --git a/src/agent/agent.service.spec.ts b/src/agent/agent.service.spec.ts
index 037faa5..26f6616 100644
--- a/src/agent/agent.service.spec.ts
+++ b/src/agent/agent.service.spec.ts
@@ -8,6 +8,7 @@ import { MetadataExposureService } from './metadata-exposure.service';
 import * as llmFactory from './llm/llm.factory';
 import * as ai from 'ai';
 import { Logger } from '@nestjs/common';
+import { Types } from 'mongoose';
 
 jest.mock('ai', () => ({
   generateText: jest.fn(),
@@ -228,6 +229,8 @@ describe('AgentService', () => {
 
       const generateTextCall = (ai.generateText as jest.Mock).mock.calls[0][0];
       expect(generateTextCall.system).not.toContain('apiKey');
+      expect(generateTextCall.system).not.toContain('rawPayload');
+      expect(generateTextCall.system).not.toContain('providerCredentials');
 
       expect(logSpy).toHaveBeenCalledWith(
         'Processing 507f1f77bcf86cd799439013 for client 507f1f77bcf86cd799439011 using provider=openai model=gpt-4',
@@ -257,6 +260,67 @@ describe('AgentService', () => {
       expect(generateTextCall.system).toContain(
         'If you greet the contact, you may use their first name: Ana.',
       );
+      expect(generateTextCall.system).toContain(
+        'Do not imply prior-conversation memory or continuity unless it is explicitly present in this conversation history.',
+      );
+      expect(generateTextCall.system).toContain('Safe contact metadata:');
+    });
+
+    it('resolves conversation before persisting user message', async () => {
+      const mockModel = {};
+      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
+      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
+
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439099',
+      } as any);
+      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
+      messagePersistenceService.createUserMessage.mockResolvedValue();
+      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
+
+      await service.run(mockInput, mockContext);
+
+      const resolveOrder =
+        messagePersistenceService.resolveConversation.mock.invocationCallOrder[0];
+      const createOrder =
+        messagePersistenceService.createUserMessage.mock.invocationCallOrder[0];
+
+      expect(resolveOrder).toBeLessThan(createOrder);
+    });
+
+    it('does not load old conversation history when a new conversation is resolved', async () => {
+      const mockModel = {};
+      const oldConversationId = new Types.ObjectId('507f1f77bcf86cd799439098');
+      const newConversationId = new Types.ObjectId('507f1f77bcf86cd799439099');
+
+      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
+      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: newConversationId,
+      } as any);
+      messagePersistenceService.getConversationContextByConversationId.mockImplementation(
+        async (conversationId: any) => {
+          if (conversationId?.toString() === oldConversationId.toString()) {
+            return [{ role: 'user', content: 'old memory' }];
+          }
+
+          return [];
+        },
+      );
+      messagePersistenceService.createUserMessage.mockResolvedValue();
+      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
+
+      await service.run(mockInput, mockContext);
+
+      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
+        newConversationId,
+        expect.anything(),
+      );
+
+      const generateTextCall = (ai.generateText as jest.Mock).mock.calls[0][0];
+      expect(generateTextCall.messages).toEqual([
+        { role: 'user', content: mockInput.message.text },
+      ]);
     });
   });
 });
diff --git a/src/channels/shared/conversation.service.spec.ts b/src/channels/shared/conversation.service.spec.ts
index 0f4db88..336e445 100644
--- a/src/channels/shared/conversation.service.spec.ts
+++ b/src/channels/shared/conversation.service.spec.ts
@@ -117,6 +117,56 @@ describe('ConversationService', () => {
     expect(result._id.toString()).toBe(newConversationId.toString());
   });
 
+  it('never reuses closed conversations', async () => {
+    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue(null);
+    repository.create.mockResolvedValue({
+      _id: newConversationId,
+      status: 'open',
+      lastMessageAt: now,
+    } as any);
+
+    const result = await service.resolveOrCreate({
+      clientId,
+      contactId,
+      channelId,
+      now,
+    });
+
+    expect(repository.findLatestOpenByClientContactAndChannel).toHaveBeenCalledWith({
+      clientId,
+      contactId,
+      channelId,
+    });
+    expect(result._id.toString()).toBe(newConversationId.toString());
+    expect((result as any).status).toBe('open');
+  });
+
+  it('does not reuse a closed conversation even when it is within timeout', async () => {
+    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue({
+      _id: existingConversationId,
+      status: 'closed',
+      lastMessageAt: new Date(now.getTime() - 1000),
+    } as any);
+
+    repository.create.mockResolvedValue({
+      _id: newConversationId,
+      status: 'open',
+      lastMessageAt: now,
+    } as any);
+
+    const result = await service.resolveOrCreate({
+      clientId,
+      contactId,
+      channelId,
+      now,
+    });
+
+    expect(result._id.toString()).toBe(newConversationId.toString());
+    expect((result as any).status).toBe('open');
+    expect(repository.create).toHaveBeenCalledTimes(1);
+    expect(repository.updateStatus).not.toHaveBeenCalled();
+  });
+
   it('touch updates lastMessageAt', async () => {
     repository.updateLastMessageAt.mockResolvedValue({} as any);
 
@@ -160,5 +210,6 @@ describe('ConversationService', () => {
     expect(resultB._id.toString()).toBe(newConversationId.toString());
     expect(repository.create).toHaveBeenCalledTimes(2);
     expect(repository.findLatestOpenByClientContactAndChannel).toHaveBeenCalledTimes(3);
+    expect(resultA._id.toString()).toBe(resultB._id.toString());
   });
 });
diff --git a/src/channels/shared/conversation.service.ts b/src/channels/shared/conversation.service.ts
index bbe4360..87fc66e 100644
--- a/src/channels/shared/conversation.service.ts
+++ b/src/channels/shared/conversation.service.ts
@@ -31,7 +31,7 @@ export class ConversationService {
         lookupParams,
       );
 
-    if (!existingOpenConversation) {
+    if (!existingOpenConversation || existingOpenConversation.status !== 'open') {
       return this.createOpenConversationWithDuplicateRecovery(
         params,
         lookupParams,
diff --git a/src/channels/shared/flow-integrity.spec.ts b/src/channels/shared/flow-integrity.spec.ts
new file mode 100644
index 0000000..6fb595f
--- /dev/null
+++ b/src/channels/shared/flow-integrity.spec.ts
@@ -0,0 +1,32 @@
+import * as fs from 'fs';
+import * as path from 'path';
+
+describe('FlowIntegrity', () => {
+  const workspaceRoot = path.resolve(__dirname, '../../..');
+
+  const read = (relativePath: string) =>
+    fs.readFileSync(path.resolve(workspaceRoot, relativePath), 'utf8');
+
+  it('channels never depend on MessageRepository directly', () => {
+    const channelSources = [
+      read('src/channels/whatsapp/whatsapp.service.ts'),
+      read('src/channels/instagram/instagram.service.ts'),
+      read('src/channels/tiktok/tiktok.service.ts'),
+    ];
+
+    for (const source of channelSources) {
+      expect(source).not.toContain('MessageRepository');
+      expect(source).not.toContain('messageRepository.');
+    }
+  });
+
+  it('agent message writes route through MessagePersistenceService', () => {
+    const agentServiceSource = read('src/agent/agent.service.ts');
+
+    expect(agentServiceSource).toContain('MessagePersistenceService');
+    expect(agentServiceSource).toContain('messagePersistenceService.createUserMessage');
+    expect(agentServiceSource).toContain('messagePersistenceService.handleOutgoingMessage');
+    expect(agentServiceSource).not.toContain('MessageRepository');
+    expect(agentServiceSource).not.toContain('messageRepository.');
+  });
+});
diff --git a/src/channels/shared/message-persistence.service.spec.ts b/src/channels/shared/message-persistence.service.spec.ts
index 77032de..2c2bda7 100644
--- a/src/channels/shared/message-persistence.service.spec.ts
+++ b/src/channels/shared/message-persistence.service.spec.ts
@@ -121,6 +121,32 @@ describe('MessagePersistenceService', () => {
         mockConversationId,
         expect.any(Date),
       );
+
+      const resolveOrder =
+        conversationService.resolveOrCreate.mock.invocationCallOrder[0];
+      const createOrder = messageRepository.create.mock.invocationCallOrder[0];
+      const touchOrder = conversationService.touch.mock.invocationCallOrder[0];
+
+      expect(resolveOrder).toBeLessThan(createOrder);
+      expect(createOrder).toBeLessThan(touchOrder);
+    });
+
+    it('should not allow createUserMessage when resolved conversation has no id', async () => {
+      conversationService.resolveOrCreate.mockResolvedValue({
+        _id: undefined,
+      } as any);
+      messageRepository.create.mockImplementation(async (payload: any) => {
+        if (!payload?.conversationId) {
+          throw new Error('conversationId is required');
+        }
+        return {} as any;
+      });
+
+      await expect(
+        service.createUserMessage('Hello!', mockContext, mockContact._id as Types.ObjectId),
+      ).rejects.toThrow('conversationId is required');
+
+      expect(messageRepository.create).toHaveBeenCalledTimes(1);
     });
   });
 
@@ -144,6 +170,14 @@ describe('MessagePersistenceService', () => {
         mockConversationId,
         expect.any(Date),
       );
+
+      const resolveOrder =
+        conversationService.resolveOrCreate.mock.invocationCallOrder[0];
+      const createOrder = messageRepository.create.mock.invocationCallOrder[0];
+      const touchOrder = conversationService.touch.mock.invocationCallOrder[0];
+
+      expect(resolveOrder).toBeLessThan(createOrder);
+      expect(createOrder).toBeLessThan(touchOrder);
     });
   });
 
diff --git a/src/database/repositories/contact.repository.spec.ts b/src/database/repositories/contact.repository.spec.ts
index 83aa6c4..f75d165 100644
--- a/src/database/repositories/contact.repository.spec.ts
+++ b/src/database/repositories/contact.repository.spec.ts
@@ -3,6 +3,151 @@ import { Types } from 'mongoose';
 import { ContactRepository } from './contact.repository';
 
 describe('ContactRepository', () => {
+  it('returns same contact for same client + channel + channelIdentifier', async () => {
+    const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
+    const channelId = new Types.ObjectId('507f1f77bcf86cd799439012');
+    const externalId = 'same-user-123';
+
+    const existing = {
+      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
+      clientId,
+      channelId,
+      externalId,
+      status: 'active',
+    };
+
+    const model = {
+      findOneAndUpdate: jest.fn().mockReturnValue({
+        exec: jest.fn().mockResolvedValue(existing),
+      }),
+    };
+
+    const repository = new ContactRepository(model as any);
+
+    const resultA = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      channelId,
+      externalId,
+      externalId,
+      'platform_id',
+      'User A',
+    );
+    const resultB = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      channelId,
+      externalId,
+      externalId,
+      'platform_id',
+      'User A',
+    );
+
+    expect(resultA._id.toString()).toBe(resultB._id.toString());
+  });
+
+  it('returns different contacts for same channelIdentifier in different clients', async () => {
+    const channelId = new Types.ObjectId('507f1f77bcf86cd799439012');
+    const clientA = new Types.ObjectId('507f1f77bcf86cd799439011');
+    const clientB = new Types.ObjectId('507f1f77bcf86cd799439013');
+    const externalId = 'same-user-123';
+
+    const model = {
+      findOneAndUpdate: jest
+        .fn()
+        .mockReturnValueOnce({
+          exec: jest.fn().mockResolvedValue({
+            _id: new Types.ObjectId('507f1f77bcf86cd799439101'),
+            clientId: clientA,
+            channelId,
+            externalId,
+            status: 'active',
+          }),
+        })
+        .mockReturnValueOnce({
+          exec: jest.fn().mockResolvedValue({
+            _id: new Types.ObjectId('507f1f77bcf86cd799439102'),
+            clientId: clientB,
+            channelId,
+            externalId,
+            status: 'active',
+          }),
+        }),
+    };
+
+    const repository = new ContactRepository(model as any);
+
+    const resultA = await repository.findOrCreateByExternalIdentity(
+      clientA,
+      channelId,
+      externalId,
+      externalId,
+      'platform_id',
+      'User A',
+    );
+
+    const resultB = await repository.findOrCreateByExternalIdentity(
+      clientB,
+      channelId,
+      externalId,
+      externalId,
+      'platform_id',
+      'User A',
+    );
+
+    expect(resultA._id.toString()).not.toBe(resultB._id.toString());
+  });
+
+  it('returns different contacts for same human across different channels', async () => {
+    const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
+    const channelA = new Types.ObjectId('507f1f77bcf86cd799439012');
+    const channelB = new Types.ObjectId('507f1f77bcf86cd799439013');
+    const externalId = 'same-user-123';
+
+    const model = {
+      findOneAndUpdate: jest
+        .fn()
+        .mockReturnValueOnce({
+          exec: jest.fn().mockResolvedValue({
+            _id: new Types.ObjectId('507f1f77bcf86cd799439103'),
+            clientId,
+            channelId: channelA,
+            externalId,
+            status: 'active',
+          }),
+        })
+        .mockReturnValueOnce({
+          exec: jest.fn().mockResolvedValue({
+            _id: new Types.ObjectId('507f1f77bcf86cd799439104'),
+            clientId,
+            channelId: channelB,
+            externalId,
+            status: 'active',
+          }),
+        }),
+    };
+
+    const repository = new ContactRepository(model as any);
+
+    const resultA = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      channelA,
+      externalId,
+      externalId,
+      'platform_id',
+      'User A',
+    );
+
+    const resultB = await repository.findOrCreateByExternalIdentity(
+      clientId,
+      channelB,
+      externalId,
+      externalId,
+      'platform_id',
+      'User A',
+    );
+
+    expect(resultA._id.toString()).not.toBe(resultB._id.toString());
+  });
+
   it('retries by reading existing contact when duplicate key error occurs', async () => {
     const duplicateError = Object.assign(new Error('E11000 duplicate key error'), {
       code: 11000,
diff --git a/src/database/repositories/message.repository.spec.ts b/src/database/repositories/message.repository.spec.ts
index 05ab0d0..1a96803 100644
--- a/src/database/repositories/message.repository.spec.ts
+++ b/src/database/repositories/message.repository.spec.ts
@@ -80,6 +80,17 @@ describe('MessageRepository', () => {
   });
 
   describe('create', () => {
+    it('should reject create when conversationId is null', async () => {
+      await expect(
+        repository.create({
+          ...mockAgentMessage,
+          conversationId: null as any,
+        }),
+      ).rejects.toThrow('conversationId is required');
+
+      expect(mockModel.create).not.toHaveBeenCalled();
+    });
+
     it('should create and return new agent message', async () => {
       mockModel.create.mockResolvedValue([mockAgentMessage]);
 
diff --git a/src/database/repositories/message.repository.ts b/src/database/repositories/message.repository.ts
index 523260b..8b43091 100644
--- a/src/database/repositories/message.repository.ts
+++ b/src/database/repositories/message.repository.ts
@@ -1,4 +1,4 @@
-import { Injectable } from '@nestjs/common';
+import { BadRequestException, Injectable } from '@nestjs/common';
 import { InjectModel } from '@nestjs/mongoose';
 import { ClientSession, Model, Types } from 'mongoose';
 import { Message } from '../schemas/message.schema';
@@ -14,6 +14,10 @@ export class MessageRepository {
     data: Partial<Message>,
     session?: ClientSession,
   ): Promise<Message> {
+    if (!data.conversationId) {
+      throw new BadRequestException('conversationId is required');
+    }
+
     const [doc] = await this.model.create([data], { session });
     return doc;
   }
diff --git a/src/database/schemas/contact.schema.spec.ts b/src/database/schemas/contact.schema.spec.ts
index 3b77e2e..794072e 100644
--- a/src/database/schemas/contact.schema.spec.ts
+++ b/src/database/schemas/contact.schema.spec.ts
@@ -5,6 +5,21 @@ import {
 } from './contact.schema';
 
 describe('ContactSchema', () => {
+  it('requires clientId', () => {
+    const clientIdPath = ContactSchema.path('clientId') as any;
+    expect(clientIdPath?.isRequired).toBeTruthy();
+  });
+
+  it('requires channelId', () => {
+    const channelIdPath = ContactSchema.path('channelId') as any;
+    expect(channelIdPath?.isRequired).toBeTruthy();
+  });
+
+  it('requires channelIdentifier (externalId)', () => {
+    const externalIdPath = ContactSchema.path('externalId') as any;
+    expect(externalIdPath?.isRequired).toBeTruthy();
+  });
+
   it('enforces unique compound index on clientId+channelId+externalId without legacy unique index', () => {
     const indexes = ContactSchema.indexes();
 
diff --git a/src/database/schemas/conversation.schema.spec.ts b/src/database/schemas/conversation.schema.spec.ts
index 5b83d7e..2147e23 100644
--- a/src/database/schemas/conversation.schema.spec.ts
+++ b/src/database/schemas/conversation.schema.spec.ts
@@ -52,4 +52,19 @@ describe('ConversationSchema', () => {
       unique: true,
     });
   });
+
+  it('enforces partial unique index for open conversations', () => {
+    const indexes = ConversationSchema.indexes();
+
+    const hasPartial = indexes.some(
+      ([fields, options]) =>
+        fields.clientId === 1 &&
+        fields.contactId === 1 &&
+        fields.channelId === 1 &&
+        options?.unique === true &&
+        options?.partialFilterExpression?.status === 'open',
+    );
+
+    expect(hasPartial).toBe(true);
+  });
 });
```
