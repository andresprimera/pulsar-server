# Staged Changes Dump

diff --git a/src/agent/agent.service.spec.ts b/src/agent/agent.service.spec.ts
index 5b1cc4f..037faa5 100644
--- a/src/agent/agent.service.spec.ts
+++ b/src/agent/agent.service.spec.ts
@@ -26,7 +26,6 @@ describe('AgentService', () => {
   const mockInput: AgentInput = {
     channel: 'whatsapp',
     contactId: '507f1f77bcf86cd799439012',
-    conversationId: 'phone123:1234567890',
     message: { type: 'text', text: 'Hello, world!' },
     contactMetadata: {
       firstName: 'Ana',
@@ -36,9 +35,9 @@ describe('AgentService', () => {
   };
 
   const mockContext: AgentContext = {
-    agentId: 'agent-1',
-    clientId: 'client-1',
-    channelId: 'channel-1',
+    agentId: '507f1f77bcf86cd799439013',
+    clientId: '507f1f77bcf86cd799439011',
+    channelId: '507f1f77bcf86cd799439014',
     systemPrompt: 'You are a helpful assistant.',
     llmConfig: {
       provider: LlmProvider.OpenAI,
@@ -50,8 +49,8 @@ describe('AgentService', () => {
   const mockContact = {
     _id: 'contact-1',
     channelIdentifier: '1234567890',
-    clientId: 'client-1',
-    channelId: 'channel-1',
+    clientId: '507f1f77bcf86cd799439011',
+    channelId: '507f1f77bcf86cd799439014',
   };
 
   beforeEach(async () => {
@@ -61,8 +60,9 @@ describe('AgentService', () => {
         {
           provide: MessagePersistenceService,
           useValue: {
+            resolveConversation: jest.fn(),
             createUserMessage: jest.fn(),
-            getConversationContext: jest.fn(),
+            getConversationContextByConversationId: jest.fn(),
             handleOutgoingMessage: jest.fn(),
           },
         },
@@ -89,39 +89,49 @@ describe('AgentService', () => {
   describe('run', () => {
     it('should call generateText with correct parameters', async () => {
       const mockModel = {};
+      const conversationId = '507f1f77bcf86cd799439099';
       const conversationHistory = [
         { role: 'user' as const, content: 'Previous message' },
       ];
 
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: conversationId,
+      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
-      messagePersistenceService.getConversationContext.mockResolvedValue(
+      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue(
         conversationHistory,
       );
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
 
       const result = await service.run(mockInput, mockContext);
 
-      expect(messagePersistenceService.createUserMessage).toHaveBeenCalledWith(
-        'Hello, world!',
+      expect(messagePersistenceService.resolveConversation).toHaveBeenCalledWith(
         {
-          channelId: 'channel-1',
-          agentId: 'agent-1',
-          clientId: 'client-1',
+          channelId: '507f1f77bcf86cd799439014',
+          agentId: '507f1f77bcf86cd799439013',
+          clientId: '507f1f77bcf86cd799439011',
           contactId: '507f1f77bcf86cd799439012',
         },
         expect.anything(),
       );
 
-      expect(messagePersistenceService.getConversationContext).toHaveBeenCalledWith(
+      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
+        expect.anything(),
+        expect.anything(),
+      );
+
+      expect(messagePersistenceService.createUserMessage).toHaveBeenCalledWith(
+        'Hello, world!',
         {
-          channelId: 'channel-1',
-          agentId: 'agent-1',
-          clientId: 'client-1',
+          channelId: '507f1f77bcf86cd799439014',
+          agentId: '507f1f77bcf86cd799439013',
+          clientId: '507f1f77bcf86cd799439011',
           contactId: '507f1f77bcf86cd799439012',
         },
         expect.anything(),
+        expect.anything(),
       );
 
       expect(llmFactory.createLLMModel).toHaveBeenCalledWith(
@@ -131,7 +141,9 @@ describe('AgentService', () => {
         model: mockModel,
         system:
           `${mockContext.systemPrompt}\n\n` +
-          'Safe contact metadata: {"firstName":"Ana","language":"es"}',
+          'Safe contact metadata: {"firstName":"Ana","language":"es"}\n' +
+          'If you greet the contact, you may use their first name: Ana.\n' +
+          'Do not imply prior-conversation memory or continuity unless it is explicitly present in this conversation history.',
         messages: [
           { role: 'user', content: 'Previous message' },
           {
@@ -144,13 +156,14 @@ describe('AgentService', () => {
       expect(messagePersistenceService.handleOutgoingMessage).toHaveBeenCalledWith(
         'AI response',
         {
-          channelId: 'channel-1',
-          agentId: 'agent-1',
-          clientId: 'client-1',
+          channelId: '507f1f77bcf86cd799439014',
+          agentId: '507f1f77bcf86cd799439013',
+          clientId: '507f1f77bcf86cd799439011',
           contactId: '507f1f77bcf86cd799439012',
         },
         expect.anything(),
         mockContext,
+        expect.anything(),
       );
 
       expect(result).toEqual({
@@ -162,8 +175,11 @@ describe('AgentService', () => {
       const mockModel = {};
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439099',
+      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
-      messagePersistenceService.getConversationContext.mockResolvedValue([]);
+      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
 
       const result = await service.run(mockInput, mockContext);
@@ -180,8 +196,11 @@ describe('AgentService', () => {
       (llmFactory.createLLMModel as jest.Mock).mockImplementation(() => {
         throw new Error('API error');
       });
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439099',
+      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
-      messagePersistenceService.getConversationContext.mockResolvedValue([]);
+      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
 
       const result = await service.run(mockInput, mockContext);
 
@@ -198,8 +217,11 @@ describe('AgentService', () => {
       const mockModel = {};
       (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
       (ai.generateText as jest.Mock).mockResolvedValue({ text: 'response' });
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439099',
+      } as any);
       messagePersistenceService.createUserMessage.mockResolvedValue();
-      messagePersistenceService.getConversationContext.mockResolvedValue([]);
+      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
       messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
 
       await service.run(mockInput, mockContext);
@@ -208,9 +230,33 @@ describe('AgentService', () => {
       expect(generateTextCall.system).not.toContain('apiKey');
 
       expect(logSpy).toHaveBeenCalledWith(
-        'Processing agent-1 for client client-1 using provider=openai model=gpt-4',
+        'Processing 507f1f77bcf86cd799439013 for client 507f1f77bcf86cd799439011 using provider=openai model=gpt-4',
+      );
+      expect(logSpy).toHaveBeenCalledWith('Response generated for 507f1f77bcf86cd799439013');
+    });
+
+    it('should keep new conversation history empty and still allow first-name greeting context', async () => {
+      const mockModel = {};
+      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
+      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'Hi Ana! How can I help today?' });
+      messagePersistenceService.resolveConversation.mockResolvedValue({
+        _id: '507f1f77bcf86cd799439099',
+      } as any);
+      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
+      messagePersistenceService.createUserMessage.mockResolvedValue();
+      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();
+
+      await service.run(mockInput, mockContext);
+
+      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalled();
+
+      const generateTextCall = (ai.generateText as jest.Mock).mock.calls[0][0];
+      expect(generateTextCall.messages).toEqual([
+        { role: 'user', content: mockInput.message.text },
+      ]);
+      expect(generateTextCall.system).toContain(
+        'If you greet the contact, you may use their first name: Ana.',
       );
-      expect(logSpy).toHaveBeenCalledWith('Response generated for agent-1');
     });
   });
 });
diff --git a/src/agent/agent.service.ts b/src/agent/agent.service.ts
index 519f56b..6daa998 100644
--- a/src/agent/agent.service.ts
+++ b/src/agent/agent.service.ts
@@ -35,18 +35,27 @@ export class AgentService {
       };
       const contactId = new Types.ObjectId(input.contactId);
 
+      const conversation =
+        await this.messagePersistenceService.resolveConversation(
+          persistenceContext,
+          contactId,
+        );
+
+      const conversationId = conversation._id as Types.ObjectId;
+
+      const conversationHistory =
+        await this.messagePersistenceService.getConversationContextByConversationId(
+          conversationId,
+          new Types.ObjectId(context.agentId),
+        );
+
       await this.messagePersistenceService.createUserMessage(
         input.message.text,
         persistenceContext,
         contactId,
+        conversationId,
       );
 
-      const conversationHistory =
-        await this.messagePersistenceService.getConversationContext(
-          persistenceContext,
-          contactId,
-        );
-
       const model = createLLMModel(context.llmConfig);
 
       // Build messages array with conversation history
@@ -97,6 +106,7 @@ export class AgentService {
         persistenceContext,
         contactId,
         context,
+        conversationId,
       );
 
       return {
@@ -137,6 +147,16 @@ export class AgentService {
       );
     }
 
+    if (typeof safeMetadata.firstName === 'string' && safeMetadata.firstName.trim()) {
+      contextLines.push(
+        `If you greet the contact, you may use their first name: ${safeMetadata.firstName.trim()}.`,
+      );
+    }
+
+    contextLines.push(
+      'Do not imply prior-conversation memory or continuity unless it is explicitly present in this conversation history.',
+    );
+
     if (contextLines.length === 0) {
       return baseSystemPrompt;
     }
diff --git a/src/agent/contracts/agent-input.ts b/src/agent/contracts/agent-input.ts
index f80921f..237c4d0 100644
--- a/src/agent/contracts/agent-input.ts
+++ b/src/agent/contracts/agent-input.ts
@@ -3,7 +3,6 @@ import { ChannelType } from '../../channels/shared/channel-type.type';
 export interface AgentInput {
   channel: ChannelType;
   contactId: string;
-  conversationId: string;
   message: {
     type: 'text';
     text: string;
diff --git a/src/agent/conversation-summary.service.spec.ts b/src/agent/conversation-summary.service.spec.ts
index 0ef1e27..9c7023b 100644
--- a/src/agent/conversation-summary.service.spec.ts
+++ b/src/agent/conversation-summary.service.spec.ts
@@ -22,7 +22,7 @@ describe('ConversationSummaryService', () => {
   let loggerErrorSpy: jest.SpyInstance;
 
   const mockChannelId = new Types.ObjectId('507f1f77bcf86cd799439011');
-  const mockContactId = new Types.ObjectId('507f1f77bcf86cd799439012');
+  const mockConversationId = new Types.ObjectId('507f1f77bcf86cd799439012');
   const mockAgentId = new Types.ObjectId('507f1f77bcf86cd799439013');
   const mockClientId = new Types.ObjectId('507f1f77bcf86cd799439014');
 
@@ -43,10 +43,10 @@ describe('ConversationSummaryService', () => {
       _id: new Types.ObjectId(),
       content: 'User message 1',
       type: 'user' as const,
-      contactId: mockContactId,
       agentId: mockAgentId,
       clientId: mockClientId,
       channelId: mockChannelId,
+      conversationId: mockConversationId,
       status: 'active' as const,
       createdAt: new Date(),
       updatedAt: new Date(),
@@ -55,10 +55,10 @@ describe('ConversationSummaryService', () => {
       _id: new Types.ObjectId(),
       content: 'Agent response 1',
       type: 'agent' as const,
-      contactId: mockContactId,
       agentId: mockAgentId,
       clientId: mockClientId,
       channelId: mockChannelId,
+      conversationId: mockConversationId,
       status: 'active' as const,
       createdAt: new Date(),
       updatedAt: new Date(),
@@ -108,15 +108,13 @@ describe('ConversationSummaryService', () => {
       messageRepository.countTokensInConversation.mockResolvedValue(1000);
 
       await service.checkAndSummarizeIfNeeded(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
         mockContext,
       );
 
       expect(messageRepository.countTokensInConversation).toHaveBeenCalledWith(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
       );
       expect(messageRepository.findConversationContext).not.toHaveBeenCalled();
@@ -133,8 +131,7 @@ describe('ConversationSummaryService', () => {
       messageRepository.create.mockResolvedValue({} as any);
 
       await service.checkAndSummarizeIfNeeded(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
         mockContext,
       );
@@ -147,10 +144,10 @@ describe('ConversationSummaryService', () => {
         expect.objectContaining({
           type: 'summary',
           content: 'This is a summary of the conversation',
-          contactId: mockContactId,
           agentId: mockAgentId,
           clientId: expect.any(Types.ObjectId),
           channelId: mockChannelId,
+          conversationId: mockConversationId,
           status: 'active',
         }),
       );
@@ -162,8 +159,7 @@ describe('ConversationSummaryService', () => {
       messageRepository.findConversationContext.mockResolvedValue([]);
 
       await service.checkAndSummarizeIfNeeded(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
         mockContext,
       );
@@ -182,8 +178,7 @@ describe('ConversationSummaryService', () => {
       // Should not throw
       await expect(
         service.checkAndSummarizeIfNeeded(
-          mockChannelId,
-          mockContactId,
+          mockConversationId,
           mockAgentId,
           mockContext,
         ),
@@ -195,8 +190,7 @@ describe('ConversationSummaryService', () => {
       messageRepository.countTokensInConversation.mockResolvedValue(1000);
 
       await service.checkAndSummarizeIfNeeded(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
         mockContext,
       );
@@ -214,8 +208,7 @@ describe('ConversationSummaryService', () => {
       messageRepository.create.mockResolvedValue({} as any);
 
       await service.checkAndSummarizeIfNeeded(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
         mockContext,
       );
diff --git a/src/agent/conversation-summary.service.ts b/src/agent/conversation-summary.service.ts
index 3b2f60f..1872b43 100644
--- a/src/agent/conversation-summary.service.ts
+++ b/src/agent/conversation-summary.service.ts
@@ -20,8 +20,7 @@ export class ConversationSummaryService {
    * This method is fire-and-forget and should not block the main flow.
    */
   async checkAndSummarizeIfNeeded(
-    channelId: Types.ObjectId,
-    contactId: Types.ObjectId,
+    conversationId: Types.ObjectId,
     agentId: Types.ObjectId,
     context: AgentContext,
   ): Promise<void> {
@@ -38,17 +37,16 @@ export class ConversationSummaryService {
 
       // Count tokens in current conversation
       const tokenCount = await this.messageRepository.countTokensInConversation(
-        channelId,
-        contactId,
+        conversationId,
         agentId,
       );
 
       this.logger.log(
-        `Conversation tokens: ${tokenCount}/${threshold} for user ${contactId} agent ${agentId}`,
+        `Conversation tokens: ${tokenCount}/${threshold} for conversation ${conversationId} agent ${agentId}`,
       );
 
       if (tokenCount >= threshold) {
-        await this.generateSummary(channelId, contactId, agentId, context);
+        await this.generateSummary(conversationId, agentId, context);
       }
     } catch (error) {
       // Log error but don't throw - this is async background processing
@@ -59,16 +57,14 @@ export class ConversationSummaryService {
   }
 
   private async generateSummary(
-    channelId: Types.ObjectId,
-    contactId: Types.ObjectId,
+    conversationId: Types.ObjectId,
     agentId: Types.ObjectId,
     context: AgentContext,
   ): Promise<void> {
     try {
       // Fetch conversation messages
       const messages = await this.messageRepository.findConversationContext(
-        channelId,
-        contactId,
+        conversationId,
         agentId,
       );
 
@@ -96,7 +92,7 @@ export class ConversationSummaryService {
 
       if (!text?.trim()) {
         this.logger.warn(
-          `LLM returned empty summary for user ${contactId} agent ${agentId}`,
+          `LLM returned empty summary for conversation ${conversationId} agent ${agentId}`,
         );
       }
 
@@ -104,15 +100,15 @@ export class ConversationSummaryService {
       await this.messageRepository.create({
         content: summary,
         type: 'summary',
-        contactId,
         agentId,
         clientId: new Types.ObjectId(context.clientId),
-        channelId,
+        channelId: new Types.ObjectId(context.channelId),
+        conversationId,
         status: 'active',
       });
 
       this.logger.log(
-        `Summary generated and saved for contact ${contactId} agent ${agentId} client ${context.clientId}`,
+        `Summary generated and saved for conversation ${conversationId} agent ${agentId} client ${context.clientId}`,
       );
     } catch (error) {
       this.logger.error(
diff --git a/src/channels/instagram/instagram.service.spec.ts b/src/channels/instagram/instagram.service.spec.ts
index ba60265..973b8b7 100644
--- a/src/channels/instagram/instagram.service.spec.ts
+++ b/src/channels/instagram/instagram.service.spec.ts
@@ -143,6 +143,13 @@ describe('InstagramService', () => {
     });
 
     expect(agentService.run).toHaveBeenCalledTimes(1);
+    expect(agentService.run).toHaveBeenCalledWith(
+      expect.objectContaining({
+        channel: 'instagram',
+        contactId: '507f1f77bcf86cd799439012',
+      }),
+      expect.anything(),
+    );
     expect(fetchSpy).toHaveBeenCalledWith(
       expect.stringContaining('/me/messages'),
       expect.objectContaining({
diff --git a/src/channels/instagram/instagram.service.ts b/src/channels/instagram/instagram.service.ts
index de4a9a4..5ef3057 100644
--- a/src/channels/instagram/instagram.service.ts
+++ b/src/channels/instagram/instagram.service.ts
@@ -239,7 +239,6 @@ export class InstagramService {
         const input: AgentInput = {
           channel: CHANNEL_TYPES.INSTAGRAM,
           contactId: contact._id.toString(),
-          conversationId: `${instagramAccountId}:${senderId}`,
           message: {
             type: 'text',
             text,
diff --git a/src/channels/shared/conversation.constants.ts b/src/channels/shared/conversation.constants.ts
new file mode 100644
index 0000000..6fb42f3
--- /dev/null
+++ b/src/channels/shared/conversation.constants.ts
@@ -0,0 +1 @@
+export const WHATSAPP_CONVERSATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
diff --git a/src/channels/shared/conversation.service.spec.ts b/src/channels/shared/conversation.service.spec.ts
new file mode 100644
index 0000000..0f4db88
--- /dev/null
+++ b/src/channels/shared/conversation.service.spec.ts
@@ -0,0 +1,164 @@
+import { Test, TestingModule } from '@nestjs/testing';
+import { Types } from 'mongoose';
+import { ConversationService } from './conversation.service';
+import { ConversationRepository } from '../../database/repositories/conversation.repository';
+import { WHATSAPP_CONVERSATION_TIMEOUT_MS } from './conversation.constants';
+
+describe('ConversationService', () => {
+  let service: ConversationService;
+  let repository: jest.Mocked<ConversationRepository>;
+
+  const now = new Date('2026-02-28T10:00:00.000Z');
+  const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
+  const contactId = new Types.ObjectId('507f1f77bcf86cd799439012');
+  const channelId = new Types.ObjectId('507f1f77bcf86cd799439013');
+  const existingConversationId = new Types.ObjectId('507f1f77bcf86cd799439014');
+  const newConversationId = new Types.ObjectId('507f1f77bcf86cd799439015');
+
+  beforeEach(async () => {
+    const module: TestingModule = await Test.createTestingModule({
+      providers: [
+        ConversationService,
+        {
+          provide: ConversationRepository,
+          useValue: {
+            create: jest.fn(),
+            findLatestOpenByClientContactAndChannel: jest.fn(),
+            updateStatus: jest.fn(),
+            updateLastMessageAt: jest.fn(),
+          },
+        },
+      ],
+    }).compile();
+
+    service = module.get(ConversationService);
+    repository = module.get(ConversationRepository);
+  });
+
+  it('reuses the open conversation when elapsed time is under 24h', async () => {
+    const existing = {
+      _id: existingConversationId,
+      status: 'open',
+      lastMessageAt: new Date(now.getTime() - WHATSAPP_CONVERSATION_TIMEOUT_MS + 1000),
+    };
+
+    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue(existing as any);
+
+    const result = await service.resolveOrCreate({
+      clientId,
+      contactId,
+      channelId,
+      now,
+    });
+
+    expect(result).toBe(existing);
+    expect(repository.updateStatus).not.toHaveBeenCalled();
+    expect(repository.create).not.toHaveBeenCalled();
+  });
+
+  it('creates a new conversation when elapsed time is >= 24h', async () => {
+    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue({
+      _id: existingConversationId,
+      status: 'open',
+      lastMessageAt: new Date(now.getTime() - WHATSAPP_CONVERSATION_TIMEOUT_MS),
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
+    expect(repository.updateStatus).toHaveBeenCalledWith(existingConversationId, 'closed');
+    expect(repository.create).toHaveBeenCalledWith(
+      expect.objectContaining({
+        clientId,
+        contactId,
+        channelId,
+        status: 'open',
+        lastMessageAt: now,
+      }),
+    );
+    expect(result._id.toString()).toBe(newConversationId.toString());
+  });
+
+  it('creates a new open conversation when no open conversation exists', async () => {
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
+    expect(repository.updateStatus).not.toHaveBeenCalled();
+    expect(repository.create).toHaveBeenCalledWith(
+      expect.objectContaining({
+        clientId,
+        contactId,
+        channelId,
+        status: 'open',
+        lastMessageAt: now,
+      }),
+    );
+    expect(result._id.toString()).toBe(newConversationId.toString());
+  });
+
+  it('touch updates lastMessageAt', async () => {
+    repository.updateLastMessageAt.mockResolvedValue({} as any);
+
+    await service.touch(existingConversationId, now);
+
+    expect(repository.updateLastMessageAt).toHaveBeenCalledWith(existingConversationId, now);
+  });
+
+  it('handles concurrent resolveOrCreate calls safely when duplicate key is raised', async () => {
+    const createdConversation = {
+      _id: newConversationId,
+      status: 'open',
+      lastMessageAt: now,
+    };
+
+    repository.findLatestOpenByClientContactAndChannel
+      .mockResolvedValueOnce(null)
+      .mockResolvedValueOnce(null)
+      .mockResolvedValueOnce(createdConversation as any);
+
+    repository.create
+      .mockResolvedValueOnce(createdConversation as any)
+      .mockRejectedValueOnce({ code: 11000 });
+
+    const [resultA, resultB] = await Promise.all([
+      service.resolveOrCreate({
+        clientId,
+        contactId,
+        channelId,
+        now,
+      }),
+      service.resolveOrCreate({
+        clientId,
+        contactId,
+        channelId,
+        now,
+      }),
+    ]);
+
+    expect(resultA._id.toString()).toBe(newConversationId.toString());
+    expect(resultB._id.toString()).toBe(newConversationId.toString());
+    expect(repository.create).toHaveBeenCalledTimes(2);
+    expect(repository.findLatestOpenByClientContactAndChannel).toHaveBeenCalledTimes(3);
+  });
+});
diff --git a/src/channels/shared/conversation.service.ts b/src/channels/shared/conversation.service.ts
new file mode 100644
index 0000000..bbe4360
--- /dev/null
+++ b/src/channels/shared/conversation.service.ts
@@ -0,0 +1,122 @@
+import { Injectable } from '@nestjs/common';
+import { Types } from 'mongoose';
+import { Conversation } from '../../database/schemas/conversation.schema';
+import { ConversationRepository } from '../../database/repositories/conversation.repository';
+import { WHATSAPP_CONVERSATION_TIMEOUT_MS } from './conversation.constants';
+
+interface MongoDuplicateKeyError {
+  code?: number;
+}
+
+@Injectable()
+export class ConversationService {
+  constructor(
+    private readonly conversationRepository: ConversationRepository,
+  ) {}
+
+  async resolveOrCreate(params: {
+    clientId: Types.ObjectId;
+    contactId: Types.ObjectId;
+    channelId: Types.ObjectId;
+    now: Date;
+  }): Promise<Conversation> {
+    const lookupParams = {
+      clientId: params.clientId,
+      contactId: params.contactId,
+      channelId: params.channelId,
+    };
+
+    const existingOpenConversation =
+      await this.conversationRepository.findLatestOpenByClientContactAndChannel(
+        lookupParams,
+      );
+
+    if (!existingOpenConversation) {
+      return this.createOpenConversationWithDuplicateRecovery(
+        params,
+        lookupParams,
+      );
+    }
+
+    const elapsed =
+      params.now.getTime() -
+      new Date(existingOpenConversation.lastMessageAt).getTime();
+
+    if (elapsed < WHATSAPP_CONVERSATION_TIMEOUT_MS) {
+      return existingOpenConversation;
+    }
+
+    await this.conversationRepository.updateStatus(
+      existingOpenConversation._id as Types.ObjectId,
+      'closed',
+    );
+
+    return this.createOpenConversationWithDuplicateRecovery(
+      params,
+      lookupParams,
+    );
+  }
+
+  async touch(
+    conversationId: Types.ObjectId,
+    now: Date,
+  ): Promise<void> {
+    await this.conversationRepository.updateLastMessageAt(conversationId, now);
+  }
+
+  private async createOpenConversation(params: {
+    clientId: Types.ObjectId;
+    contactId: Types.ObjectId;
+    channelId: Types.ObjectId;
+    now: Date;
+  }): Promise<Conversation> {
+    return this.conversationRepository.create({
+      clientId: params.clientId,
+      contactId: params.contactId,
+      channelId: params.channelId,
+      status: 'open',
+      lastMessageAt: params.now,
+    });
+  }
+
+  private async createOpenConversationWithDuplicateRecovery(
+    createParams: {
+      clientId: Types.ObjectId;
+      contactId: Types.ObjectId;
+      channelId: Types.ObjectId;
+      now: Date;
+    },
+    lookupParams: {
+      clientId: Types.ObjectId;
+      contactId: Types.ObjectId;
+      channelId: Types.ObjectId;
+    },
+  ): Promise<Conversation> {
+    try {
+      return await this.createOpenConversation(createParams);
+    } catch (error) {
+      if (!this.isDuplicateKeyError(error)) {
+        throw error;
+      }
+
+      const createdByAnotherRequest =
+        await this.conversationRepository.findLatestOpenByClientContactAndChannel(
+          lookupParams,
+        );
+
+      if (createdByAnotherRequest) {
+        return createdByAnotherRequest;
+      }
+
+      throw error;
+    }
+  }
+
+  private isDuplicateKeyError(error: unknown): boolean {
+    return (
+      typeof error === 'object' &&
+      error !== null &&
+      (error as MongoDuplicateKeyError).code === 11000
+    );
+  }
+}
diff --git a/src/channels/shared/message-persistence.service.spec.ts b/src/channels/shared/message-persistence.service.spec.ts
index 504af0e..77032de 100644
--- a/src/channels/shared/message-persistence.service.spec.ts
+++ b/src/channels/shared/message-persistence.service.spec.ts
@@ -3,11 +3,14 @@ import { MessagePersistenceService } from './message-persistence.service';
 import { MessageRepository } from '../../database/repositories/message.repository';
 import { ConversationSummaryService } from '../../agent/conversation-summary.service';
 import { Types } from 'mongoose';
+import { ConversationService } from './conversation.service';
 
 describe('MessagePersistenceService', () => {
   let service: MessagePersistenceService;
   let messageRepository: jest.Mocked<MessageRepository>;
   let conversationSummaryService: jest.Mocked<ConversationSummaryService>;
+  let conversationService: jest.Mocked<ConversationService>;
+  const mockConversationId = new Types.ObjectId('507f1f77bcf86cd799439015');
 
   const mockContext = {
     channelId: '507f1f77bcf86cd799439014',
@@ -34,6 +37,7 @@ describe('MessagePersistenceService', () => {
       agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
       clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
       channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
+      conversationId: mockConversationId,
       status: 'active' as const,
       createdAt: new Date(),
       updatedAt: new Date(),
@@ -46,6 +50,7 @@ describe('MessagePersistenceService', () => {
       agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
       clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
       channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
+      conversationId: mockConversationId,
       status: 'active' as const,
       createdAt: new Date(),
       updatedAt: new Date(),
@@ -63,6 +68,13 @@ describe('MessagePersistenceService', () => {
             findConversationContext: jest.fn(),
           },
         },
+        {
+          provide: ConversationService,
+          useValue: {
+            resolveOrCreate: jest.fn(),
+            touch: jest.fn(),
+          },
+        },
         {
           provide: ConversationSummaryService,
           useValue: {
@@ -74,7 +86,15 @@ describe('MessagePersistenceService', () => {
 
     service = module.get<MessagePersistenceService>(MessagePersistenceService);
     messageRepository = module.get(MessageRepository);
+    conversationService = module.get(ConversationService);
     conversationSummaryService = module.get(ConversationSummaryService);
+
+    conversationService.resolveOrCreate.mockResolvedValue({
+      _id: mockConversationId,
+      status: 'open',
+      lastMessageAt: new Date(),
+    } as any);
+    conversationService.touch.mockResolvedValue();
   });
 
   it('should be defined', () => {
@@ -94,8 +114,13 @@ describe('MessagePersistenceService', () => {
         agentId: expect.any(Types.ObjectId),
         clientId: expect.any(Types.ObjectId),
         channelId: expect.any(Types.ObjectId),
+        conversationId: mockConversationId,
         status: 'active',
       });
+      expect(conversationService.touch).toHaveBeenCalledWith(
+        mockConversationId,
+        expect.any(Date),
+      );
     });
   });
 
@@ -112,20 +137,27 @@ describe('MessagePersistenceService', () => {
         agentId: expect.any(Types.ObjectId),
         clientId: expect.any(Types.ObjectId),
         channelId: expect.any(Types.ObjectId),
+        conversationId: mockConversationId,
         status: 'active',
       });
+      expect(conversationService.touch).toHaveBeenCalledWith(
+        mockConversationId,
+        expect.any(Date),
+      );
     });
   });
 
-  describe('getConversationContext', () => {
+  describe('getConversationContextByConversationId', () => {
     it('should retrieve and format conversation context', async () => {
       messageRepository.findConversationContext.mockResolvedValue(mockMessages as any);
 
-      const result = await service.getConversationContext(mockContext, mockContact._id as Types.ObjectId);
+      const result = await service.getConversationContextByConversationId(
+        mockConversationId,
+        new Types.ObjectId(mockContext.agentId),
+      );
 
       expect(messageRepository.findConversationContext).toHaveBeenCalledWith(
-        expect.any(Types.ObjectId),
-        mockContact._id,
+        mockConversationId,
         expect.any(Types.ObjectId),
       );
       expect(result).toEqual([
@@ -137,7 +169,10 @@ describe('MessagePersistenceService', () => {
     it('should return empty array when no messages found', async () => {
       messageRepository.findConversationContext.mockResolvedValue([]);
 
-      const result = await service.getConversationContext(mockContext, mockContact._id as Types.ObjectId);
+      const result = await service.getConversationContextByConversationId(
+        mockConversationId,
+        new Types.ObjectId(mockContext.agentId),
+      );
 
       expect(result).toEqual([]);
     });
@@ -191,7 +226,11 @@ describe('MessagePersistenceService', () => {
       };
 
       // Should not throw even if summarization fails
-      service.triggerSummarization(mockContext, mockContact._id as Types.ObjectId, agentContext);
+      service.triggerSummarization(
+        mockConversationId,
+        new Types.ObjectId(mockContext.agentId),
+        agentContext,
+      );
 
       // Wait a bit for async call
       await new Promise(resolve => setTimeout(resolve, 10));
@@ -222,6 +261,7 @@ describe('MessagePersistenceService', () => {
         mockContext,
         mockContact._id as Types.ObjectId,
         agentContext,
+        mockConversationId,
       );
 
       expect(messageRepository.create).toHaveBeenCalledWith(
diff --git a/src/channels/shared/message-persistence.service.ts b/src/channels/shared/message-persistence.service.ts
index b30f78f..c42d0b4 100644
--- a/src/channels/shared/message-persistence.service.ts
+++ b/src/channels/shared/message-persistence.service.ts
@@ -3,6 +3,8 @@ import { Types } from 'mongoose';
 import { MessageRepository } from '../../database/repositories/message.repository';
 import { ConversationSummaryService } from '../../agent/conversation-summary.service';
 import { AgentContext } from '../../agent/contracts/agent-context';
+import { ConversationService } from './conversation.service';
+import { Conversation } from '../../database/schemas/conversation.schema';
 
 export interface MessagePersistenceContext {
   channelId: Types.ObjectId | string;
@@ -20,8 +22,28 @@ export class MessagePersistenceService {
   constructor(
     private readonly messageRepository: MessageRepository,
     private readonly conversationSummaryService: ConversationSummaryService,
+    private readonly conversationService: ConversationService,
   ) {}
 
+  async resolveConversation(
+    context: MessagePersistenceContext,
+    contactId: Types.ObjectId,
+    now: Date = new Date(),
+  ): Promise<Conversation> {
+    if (!contactId) {
+      throw new BadRequestException(
+        MessagePersistenceService.MISSING_IDENTITY_ERROR,
+      );
+    }
+
+    return this.conversationService.resolveOrCreate({
+      clientId: new Types.ObjectId(context.clientId),
+      contactId,
+      channelId: new Types.ObjectId(context.channelId),
+      now,
+    });
+  }
+
   /**
    * Single entrypoint for creating user messages.
    */
@@ -29,6 +51,7 @@ export class MessagePersistenceService {
     content: string,
     context: MessagePersistenceContext,
     contactId: Types.ObjectId,
+    conversationId?: Types.ObjectId,
   ): Promise<void> {
     if (!contactId || !context.contactId) {
       throw new BadRequestException(
@@ -43,6 +66,11 @@ export class MessagePersistenceService {
       );
     }
 
+    const now = new Date();
+    const conversation = conversationId
+      ? ({ _id: conversationId } as Conversation)
+      : await this.resolveConversation(context, contactId, now);
+
     await this.messageRepository.create({
       content,
       type: 'user',
@@ -50,9 +78,15 @@ export class MessagePersistenceService {
       agentId: new Types.ObjectId(context.agentId),
       clientId: new Types.ObjectId(context.clientId),
       channelId: new Types.ObjectId(context.channelId),
+      conversationId: conversation._id,
       status: 'active',
     });
 
+    await this.conversationService.touch(
+      conversation._id as Types.ObjectId,
+      now,
+    );
+
     this.logger.log(
       `Created user message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
     );
@@ -65,6 +99,7 @@ export class MessagePersistenceService {
     content: string,
     context: MessagePersistenceContext,
     contactId: Types.ObjectId,
+    conversationId?: Types.ObjectId,
   ): Promise<void> {
     if (!contactId) {
       throw new BadRequestException(
@@ -72,6 +107,11 @@ export class MessagePersistenceService {
       );
     }
 
+    const now = new Date();
+    const conversation = conversationId
+      ? ({ _id: conversationId } as Conversation)
+      : await this.resolveConversation(context, contactId, now);
+
     await this.messageRepository.create({
       content,
       type: 'agent',
@@ -79,9 +119,15 @@ export class MessagePersistenceService {
       agentId: new Types.ObjectId(context.agentId),
       clientId: new Types.ObjectId(context.clientId),
       channelId: new Types.ObjectId(context.channelId),
+      conversationId: conversation._id,
       status: 'active',
     });
 
+    await this.conversationService.touch(
+      conversation._id as Types.ObjectId,
+      now,
+    );
+
     this.logger.log(
       `Saved agent message: contact=${contactId} agent=${context.agentId} client=${context.clientId} channel=${context.channelId}`,
     );
@@ -91,20 +137,13 @@ export class MessagePersistenceService {
    * Retrieves conversation context (messages since last summary)
    * Returns an array of messages formatted for the agent's conversation history
    */
-  async getConversationContext(
-    context: MessagePersistenceContext,
-    contactId: Types.ObjectId,
+  async getConversationContextByConversationId(
+    conversationId: Types.ObjectId,
+    agentId: Types.ObjectId,
   ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
-    if (!contactId) {
-      throw new BadRequestException(
-        MessagePersistenceService.MISSING_IDENTITY_ERROR,
-      );
-    }
-
     const messages = await this.messageRepository.findConversationContext(
-      new Types.ObjectId(context.channelId),
-      contactId,
-      new Types.ObjectId(context.agentId),
+      conversationId,
+      agentId,
     );
 
     return messages.map((msg) => ({
@@ -120,15 +159,14 @@ export class MessagePersistenceService {
    * This is fire-and-forget and will not block the response flow
    */
   triggerSummarization(
-    context: MessagePersistenceContext,
-    contactId: Types.ObjectId,
+    conversationId: Types.ObjectId,
+    agentId: Types.ObjectId,
     agentContext: AgentContext,
   ): void {
     this.conversationSummaryService
       .checkAndSummarizeIfNeeded(
-        new Types.ObjectId(context.channelId),
-        contactId,
-        new Types.ObjectId(context.agentId),
+        conversationId,
+        agentId,
         agentContext,
       )
       .catch((err) => {
@@ -146,11 +184,22 @@ export class MessagePersistenceService {
     context: MessagePersistenceContext,
     contactId: Types.ObjectId,
     agentContext: AgentContext,
+    conversationId?: Types.ObjectId,
   ): Promise<void> {
     // Save agent message
-    await this.saveAgentMessage(content, context, contactId);
+    await this.saveAgentMessage(content, context, contactId, conversationId);
 
     // Trigger async summarization check
-    this.triggerSummarization(context, contactId, agentContext);
+    const resolvedConversationId =
+      conversationId ||
+      (
+        await this.resolveConversation(context, contactId)
+      )._id;
+
+    this.triggerSummarization(
+      resolvedConversationId as Types.ObjectId,
+      new Types.ObjectId(context.agentId),
+      agentContext,
+    );
   }
 }
diff --git a/src/channels/shared/shared.module.ts b/src/channels/shared/shared.module.ts
index 6550789..c1331f5 100644
--- a/src/channels/shared/shared.module.ts
+++ b/src/channels/shared/shared.module.ts
@@ -13,12 +13,14 @@ import { TiktokIdentifierExtractor } from './contact-identifier/tiktok-identifie
 import { WebIdentifierExtractor } from './contact-identifier/web-identifier.extractor';
 import { ApiIdentifierExtractor } from './contact-identifier/api-identifier.extractor';
 import { CONTACT_IDENTIFIER_EXTRACTORS } from './contact-identifier/contact-identifier-extractor.interface';
+import { ConversationService } from './conversation.service';
 
 @Module({
   imports: [ConfigModule, DatabaseModule],
   providers: [
     MessagePersistenceService,
     ConversationSummaryService,
+    ConversationService,
     AgentRoutingService,
     ContactIdentityResolver,
     ContactIdentifierExtractorRegistry,
@@ -58,6 +60,7 @@ import { CONTACT_IDENTIFIER_EXTRACTORS } from './contact-identifier/contact-iden
   exports: [
     MessagePersistenceService,
     ConversationSummaryService,
+    ConversationService,
     AgentRoutingService,
     ContactIdentityResolver,
     ContactIdentifierExtractorRegistry,
diff --git a/src/channels/tiktok/tiktok.service.spec.ts b/src/channels/tiktok/tiktok.service.spec.ts
index b793322..5c67236 100644
--- a/src/channels/tiktok/tiktok.service.spec.ts
+++ b/src/channels/tiktok/tiktok.service.spec.ts
@@ -196,6 +196,13 @@ describe('TiktokService', () => {
 
       expect(agentRoutingService.resolveRoute).toHaveBeenCalled();
       expect(agentService.run).toHaveBeenCalled();
+      expect(agentService.run).toHaveBeenCalledWith(
+        expect.objectContaining({
+          channel: 'tiktok',
+          contactId: '507f1f77bcf86cd799439012',
+        }),
+        expect.anything(),
+      );
       
       // Verify fetch was called with correct args
       expect(fetchSpy).toHaveBeenCalledWith(
diff --git a/src/channels/tiktok/tiktok.service.ts b/src/channels/tiktok/tiktok.service.ts
index 78f8522..589b25f 100644
--- a/src/channels/tiktok/tiktok.service.ts
+++ b/src/channels/tiktok/tiktok.service.ts
@@ -133,7 +133,6 @@ export class TiktokService {
     const input: AgentInput = {
       channel: CHANNEL_TYPES.TIKTOK,
       contactId: contact._id.toString(),
-      conversationId: data.conversation_id,
       message: {
         type: 'text',
         text: data.message.text,
diff --git a/src/channels/whatsapp/whatsapp.service.spec.ts b/src/channels/whatsapp/whatsapp.service.spec.ts
index 310b876..181e185 100644
--- a/src/channels/whatsapp/whatsapp.service.spec.ts
+++ b/src/channels/whatsapp/whatsapp.service.spec.ts
@@ -257,7 +257,6 @@ describe('WhatsappService', () => {
         {
           channel: 'whatsapp',
           contactId: '507f1f77bcf86cd799439012',
-          conversationId: 'phone123:1234567890',
           message: { type: 'text', text: 'Hello' },
           contactMetadata: undefined,
           contactSummary: undefined,
diff --git a/src/channels/whatsapp/whatsapp.service.ts b/src/channels/whatsapp/whatsapp.service.ts
index 35de8d0..c226be8 100644
--- a/src/channels/whatsapp/whatsapp.service.ts
+++ b/src/channels/whatsapp/whatsapp.service.ts
@@ -196,7 +196,6 @@ export class WhatsappService {
     const input: AgentInput = {
       channel: CHANNEL_TYPES.WHATSAPP,
       contactId: contact._id.toString(),
-      conversationId: `${phoneNumberId}:${message.from}`,
       message: {
         type: 'text',
         text: message.text.body,
diff --git a/src/database/database.module.ts b/src/database/database.module.ts
index 057e544..ee6d78e 100644
--- a/src/database/database.module.ts
+++ b/src/database/database.module.ts
@@ -20,6 +20,11 @@ import { User, UserSchema } from './schemas/user.schema';
 import { UserRepository } from './repositories/user.repository';
 import { Message, MessageSchema } from './schemas/message.schema';
 import { MessageRepository } from './repositories/message.repository';
+import {
+  Conversation,
+  ConversationSchema,
+} from './schemas/conversation.schema';
+import { ConversationRepository } from './repositories/conversation.repository';
 import { OnboardingModule } from '../onboarding/onboarding.module';
 
 const repositories = [
@@ -32,6 +37,7 @@ const repositories = [
   ContactRepository,
   UserRepository,
   MessageRepository,
+  ConversationRepository,
 ];
 
 @Global()
@@ -56,6 +62,7 @@ const repositories = [
       { name: Contact.name, schema: ContactSchema },
       { name: User.name, schema: UserSchema },
       { name: Message.name, schema: MessageSchema },
+      { name: Conversation.name, schema: ConversationSchema },
     ]),
     forwardRef(() => OnboardingModule),
   ],
diff --git a/src/database/repositories/conversation.repository.ts b/src/database/repositories/conversation.repository.ts
new file mode 100644
index 0000000..f90f46f
--- /dev/null
+++ b/src/database/repositories/conversation.repository.ts
@@ -0,0 +1,56 @@
+import { Injectable } from '@nestjs/common';
+import { InjectModel } from '@nestjs/mongoose';
+import { ClientSession, Model, Types } from 'mongoose';
+import { Conversation } from '../schemas/conversation.schema';
+
+@Injectable()
+export class ConversationRepository {
+  constructor(
+    @InjectModel(Conversation.name)
+    private readonly model: Model<Conversation>,
+  ) {}
+
+  async create(
+    data: Partial<Conversation>,
+    session?: ClientSession,
+  ): Promise<Conversation> {
+    const [doc] = await this.model.create([data], { session });
+    return doc;
+  }
+
+  async findLatestOpenByClientContactAndChannel(params: {
+    clientId: Types.ObjectId;
+    contactId: Types.ObjectId;
+    channelId: Types.ObjectId;
+  }): Promise<Conversation | null> {
+    return this.model
+      .findOne({
+        clientId: params.clientId,
+        contactId: params.contactId,
+        channelId: params.channelId,
+        status: 'open',
+      })
+      .sort({ updatedAt: -1 })
+      .exec();
+  }
+
+  async updateStatus(
+    id: Types.ObjectId,
+    status: 'open' | 'closed' | 'archived',
+    session?: ClientSession,
+  ): Promise<Conversation | null> {
+    return this.model
+      .findByIdAndUpdate(id, { status }, { new: true, session })
+      .exec();
+  }
+
+  async updateLastMessageAt(
+    id: Types.ObjectId,
+    lastMessageAt: Date,
+    session?: ClientSession,
+  ): Promise<Conversation | null> {
+    return this.model
+      .findByIdAndUpdate(id, { lastMessageAt }, { new: true, session })
+      .exec();
+  }
+}
diff --git a/src/database/repositories/message.repository.spec.ts b/src/database/repositories/message.repository.spec.ts
index 75735c1..05ab0d0 100644
--- a/src/database/repositories/message.repository.spec.ts
+++ b/src/database/repositories/message.repository.spec.ts
@@ -12,6 +12,7 @@ describe('MessageRepository', () => {
   const mockContactId = new Types.ObjectId('507f1f77bcf86cd799439012');
   const mockAgentId = new Types.ObjectId('507f1f77bcf86cd799439013');
   const mockClientId = new Types.ObjectId('507f1f77bcf86cd799439014');
+  const mockConversationId = new Types.ObjectId('507f1f77bcf86cd799439015');
 
   const mockUserMessage = {
     _id: new Types.ObjectId(),
@@ -20,6 +21,7 @@ describe('MessageRepository', () => {
     contactId: mockContactId,
     clientId: mockClientId,
     channelId: mockChannelId,
+    conversationId: mockConversationId,
     status: 'active' as const,
     createdAt: new Date(),
     updatedAt: new Date(),
@@ -32,6 +34,7 @@ describe('MessageRepository', () => {
     agentId: mockAgentId,
     clientId: mockClientId,
     channelId: mockChannelId,
+    conversationId: mockConversationId,
     status: 'active' as const,
     createdAt: new Date(),
     updatedAt: new Date(),
@@ -44,6 +47,7 @@ describe('MessageRepository', () => {
     agentId: mockAgentId,
     clientId: mockClientId,
     channelId: mockChannelId,
+    conversationId: mockConversationId,
     status: 'active' as const,
     createdAt: new Date(),
     updatedAt: new Date(),
@@ -317,8 +321,7 @@ describe('MessageRepository', () => {
       });
 
       const result = await repository.findConversationContext(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
       );
 
@@ -343,8 +346,7 @@ describe('MessageRepository', () => {
       });
 
       const result = await repository.findConversationContext(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
       );
 
@@ -362,8 +364,7 @@ describe('MessageRepository', () => {
       jest.spyOn(repository, 'findConversationContext').mockResolvedValue(messages as any);
 
       const result = await repository.countTokensInConversation(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
       );
 
@@ -375,8 +376,7 @@ describe('MessageRepository', () => {
       jest.spyOn(repository, 'findConversationContext').mockResolvedValue([]);
 
       const result = await repository.countTokensInConversation(
-        mockChannelId,
-        mockContactId,
+        mockConversationId,
         mockAgentId,
       );
 
diff --git a/src/database/repositories/message.repository.ts b/src/database/repositories/message.repository.ts
index 39401b2..523260b 100644
--- a/src/database/repositories/message.repository.ts
+++ b/src/database/repositories/message.repository.ts
@@ -63,15 +63,13 @@ export class MessageRepository {
   }
 
   async findConversationContext(
-    channelId: Types.ObjectId,
-    contactId: Types.ObjectId,
+    conversationId: Types.ObjectId,
     agentId: Types.ObjectId,
   ): Promise<Message[]> {
     // Find the most recent summary for this conversation
     const lastSummary = await this.model
       .findOne({
-        channelId,
-        contactId,
+        conversationId,
         agentId,
         type: 'summary',
         status: 'active',
@@ -81,8 +79,7 @@ export class MessageRepository {
 
     // Build query for messages after the last summary
     const query: any = {
-      channelId,
-      contactId,
+      conversationId,
       agentId,
       status: 'active',
       type: { $in: ['user', 'agent'] },
@@ -116,13 +113,11 @@ export class MessageRepository {
   }
 
   async countTokensInConversation(
-    channelId: Types.ObjectId,
-    contactId: Types.ObjectId,
+    conversationId: Types.ObjectId,
     agentId: Types.ObjectId,
   ): Promise<number> {
     const messages = await this.findConversationContext(
-      channelId,
-      contactId,
+      conversationId,
       agentId,
     );
 
diff --git a/src/database/schemas/conversation.schema.spec.ts b/src/database/schemas/conversation.schema.spec.ts
new file mode 100644
index 0000000..5b83d7e
--- /dev/null
+++ b/src/database/schemas/conversation.schema.spec.ts
@@ -0,0 +1,55 @@
+import { model, models, Types } from 'mongoose';
+import { ConversationSchema } from './conversation.schema';
+
+describe('ConversationSchema', () => {
+  const ConversationValidationModel =
+    models.ConversationValidationHarness ||
+    model(
+      'ConversationValidationHarness',
+      ConversationSchema,
+      'conversations_validation_harness',
+    );
+
+  it('requires lastMessageAt', async () => {
+    const conversation = new ConversationValidationModel({
+      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
+      contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
+      channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
+      status: 'open',
+    });
+
+    await expect(conversation.validate()).rejects.toThrow();
+  });
+
+  it('accepts valid conversation document', async () => {
+    const conversation = new ConversationValidationModel({
+      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
+      contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
+      channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
+      status: 'open',
+      lastMessageAt: new Date(),
+    });
+
+    await expect(conversation.validate()).resolves.toBeUndefined();
+  });
+
+  it('defines partial unique index for one open conversation per client/contact/channel', () => {
+    const indexes = ConversationSchema.indexes();
+
+    const uniqueOpenIndex = indexes.find(
+      ([fields, options]) =>
+        fields.clientId === 1 &&
+        fields.contactId === 1 &&
+        fields.channelId === 1 &&
+        options?.unique === true,
+    );
+
+    expect(uniqueOpenIndex).toBeDefined();
+    expect(uniqueOpenIndex?.[1]).toMatchObject({
+      partialFilterExpression: {
+        status: 'open',
+      },
+      unique: true,
+    });
+  });
+});
diff --git a/src/database/schemas/conversation.schema.ts b/src/database/schemas/conversation.schema.ts
new file mode 100644
index 0000000..c5ce464
--- /dev/null
+++ b/src/database/schemas/conversation.schema.ts
@@ -0,0 +1,73 @@
+import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
+import { Document, Types } from 'mongoose';
+
+@Schema({ collection: 'conversations', timestamps: true })
+export class Conversation extends Document {
+  @Prop({
+    type: Types.ObjectId,
+    ref: 'Client',
+    required: true,
+    index: true,
+  })
+  clientId: Types.ObjectId;
+
+  @Prop({
+    type: Types.ObjectId,
+    ref: 'Contact',
+    required: true,
+    index: true,
+  })
+  contactId: Types.ObjectId;
+
+  @Prop({
+    type: Types.ObjectId,
+    ref: 'Channel',
+    required: true,
+    index: true,
+  })
+  channelId: Types.ObjectId;
+
+  @Prop({
+    required: true,
+    enum: ['open', 'closed', 'archived'],
+    default: 'open',
+    index: true,
+  })
+  status: 'open' | 'closed' | 'archived';
+
+  @Prop({
+    required: true,
+    index: true,
+  })
+  lastMessageAt: Date;
+
+  @Prop()
+  summary?: string;
+
+  @Prop({ type: Object })
+  metadata?: Record<string, any>;
+
+  createdAt: Date;
+  updatedAt: Date;
+}
+
+export const ConversationSchema = SchemaFactory.createForClass(Conversation);
+
+ConversationSchema.index({
+  clientId: 1,
+  contactId: 1,
+  channelId: 1,
+  status: 1,
+});
+
+ConversationSchema.index(
+  {
+    clientId: 1,
+    contactId: 1,
+    channelId: 1,
+  },
+  {
+    unique: true,
+    partialFilterExpression: { status: 'open' },
+  },
+);
diff --git a/src/database/schemas/message.schema.spec.ts b/src/database/schemas/message.schema.spec.ts
index 966f76c..e514c78 100644
--- a/src/database/schemas/message.schema.spec.ts
+++ b/src/database/schemas/message.schema.spec.ts
@@ -12,6 +12,7 @@ describe('MessageSchema', () => {
       type: 'user',
       clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
       channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
+      conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
       status: 'active',
     });
 
@@ -27,9 +28,23 @@ describe('MessageSchema', () => {
       agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
       clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
       channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
+      conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
       status: 'active',
     });
 
     await expect(message.validate()).resolves.toBeUndefined();
   });
+
+  it('should fail validation when conversationId is missing', async () => {
+    const message = new MessageValidationModel({
+      content: 'Agent response',
+      type: 'agent',
+      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
+      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
+      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
+      status: 'active',
+    });
+
+    await expect(message.validate()).rejects.toThrow();
+  });
 });
diff --git a/src/database/schemas/message.schema.ts b/src/database/schemas/message.schema.ts
index 80d187f..b7ad74f 100644
--- a/src/database/schemas/message.schema.ts
+++ b/src/database/schemas/message.schema.ts
@@ -46,6 +46,14 @@ export class Message extends Document {
   })
   channelId: Types.ObjectId;
 
+  @Prop({
+    type: Types.ObjectId,
+    ref: 'Conversation',
+    required: true,
+    index: true,
+  })
+  conversationId: Types.ObjectId;
+
   @Prop({
     required: true,
     enum: ['active', 'inactive', 'archived'],
