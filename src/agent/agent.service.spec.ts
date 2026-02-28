import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { AgentInput } from './contracts/agent-input';
import { AgentContext } from './contracts/agent-context';
import { LlmProvider } from './llm/provider.enum';
import { MessagePersistenceService } from '../channels/shared/message-persistence.service';
import { MetadataExposureService } from './metadata-exposure.service';
import * as llmFactory from './llm/llm.factory';
import * as ai from 'ai';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('./llm/llm.factory', () => ({
  createLLMModel: jest.fn(),
}));

describe('AgentService', () => {
  let service: AgentService;
  let messagePersistenceService: jest.Mocked<MessagePersistenceService>;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const mockInput: AgentInput = {
    channel: 'whatsapp',
    contactId: '507f1f77bcf86cd799439012',
    message: { type: 'text', text: 'Hello, world!' },
    contactMetadata: {
      firstName: 'Ana',
      language: 'es',
      apiKey: 'secret',
    },
  };

  const mockContext: AgentContext = {
    agentId: '507f1f77bcf86cd799439013',
    clientId: '507f1f77bcf86cd799439011',
    channelId: '507f1f77bcf86cd799439014',
    systemPrompt: 'You are a helpful assistant.',
    llmConfig: {
      provider: LlmProvider.OpenAI,
      apiKey: 'sk-mock',
      model: 'gpt-4',
    },
  };

  const mockContact = {
    _id: 'contact-1',
    channelIdentifier: '1234567890',
    clientId: '507f1f77bcf86cd799439011',
    channelId: '507f1f77bcf86cd799439014',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: MessagePersistenceService,
          useValue: {
            resolveConversation: jest.fn(),
            createUserMessage: jest.fn(),
            getConversationContextByConversationId: jest.fn(),
            handleOutgoingMessage: jest.fn(),
          },
        },
        MetadataExposureService,
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
    messagePersistenceService = module.get(MessagePersistenceService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('run', () => {
    it('should call generateText with correct parameters', async () => {
      const mockModel = {};
      const conversationId = '507f1f77bcf86cd799439099';
      const conversationHistory = [
        { role: 'user' as const, content: 'Previous message' },
      ];

      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: conversationId,
      } as any);
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue(
        conversationHistory,
      );
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      const result = await service.run(mockInput, mockContext);

      expect(messagePersistenceService.resolveConversation).toHaveBeenCalledWith(
        {
          channelId: '507f1f77bcf86cd799439014',
          agentId: '507f1f77bcf86cd799439013',
          clientId: '507f1f77bcf86cd799439011',
          contactId: '507f1f77bcf86cd799439012',
        },
        expect.anything(),
      );

      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
      );

      expect(messagePersistenceService.createUserMessage).toHaveBeenCalledWith(
        'Hello, world!',
        {
          channelId: '507f1f77bcf86cd799439014',
          agentId: '507f1f77bcf86cd799439013',
          clientId: '507f1f77bcf86cd799439011',
          contactId: '507f1f77bcf86cd799439012',
        },
        expect.anything(),
        expect.anything(),
      );

      expect(llmFactory.createLLMModel).toHaveBeenCalledWith(
        mockContext.llmConfig,
      );
      expect(ai.generateText).toHaveBeenCalledWith({
        model: mockModel,
        system:
          `${mockContext.systemPrompt}\n\n` +
          'Safe contact metadata: {"firstName":"Ana","language":"es"}\n' +
          'If you greet the contact, you may use their first name: Ana.\n' +
          'Do not imply prior-conversation memory or continuity unless it is explicitly present in this conversation history.',
        messages: [
          { role: 'user', content: 'Previous message' },
          {
            role: 'user',
            content: mockInput.message.text,
          },
        ],
      });

      expect(messagePersistenceService.handleOutgoingMessage).toHaveBeenCalledWith(
        'AI response',
        {
          channelId: '507f1f77bcf86cd799439014',
          agentId: '507f1f77bcf86cd799439013',
          clientId: '507f1f77bcf86cd799439011',
          contactId: '507f1f77bcf86cd799439012',
        },
        expect.anything(),
        mockContext,
        expect.anything(),
      );

      expect(result).toEqual({
        reply: { type: 'text', text: 'AI response' },
      });
    });

    it('should return fallback for empty AI response', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
      } as any);
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      const result = await service.run(mockInput, mockContext);

      expect(result).toEqual({
        reply: {
          type: 'text',
          text: "I'm having trouble responding right now.",
        },
      });
    });

    it('should return fallback response on error', async () => {
      (llmFactory.createLLMModel as jest.Mock).mockImplementation(() => {
        throw new Error('API error');
      });
      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
      } as any);
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);

      const result = await service.run(mockInput, mockContext);

      expect(result).toEqual({
        reply: {
          type: 'text',
          text: "I'm having trouble responding right now.",
        },
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log agent and client info before and after call', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'response' });
      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
      } as any);
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      await service.run(mockInput, mockContext);

      const generateTextCall = (ai.generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.system).not.toContain('apiKey');
      expect(generateTextCall.system).not.toContain('rawPayload');
      expect(generateTextCall.system).not.toContain('providerCredentials');

      expect(logSpy).toHaveBeenCalledWith(
        'Processing 507f1f77bcf86cd799439013 for client 507f1f77bcf86cd799439011 using provider=openai model=gpt-4',
      );
      expect(logSpy).toHaveBeenCalledWith('Response generated for 507f1f77bcf86cd799439013');
    });

    it('should keep new conversation history empty and still allow first-name greeting context', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'Hi Ana! How can I help today?' });
      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
      } as any);
      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      await service.run(mockInput, mockContext);

      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalled();

      const generateTextCall = (ai.generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.messages).toEqual([
        { role: 'user', content: mockInput.message.text },
      ]);
      expect(generateTextCall.system).toContain(
        'If you greet the contact, you may use their first name: Ana.',
      );
      expect(generateTextCall.system).toContain(
        'Do not imply prior-conversation memory or continuity unless it is explicitly present in this conversation history.',
      );
      expect(generateTextCall.system).toContain('Safe contact metadata:');
    });

    it('resolves conversation before persisting user message', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });

      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
      } as any);
      messagePersistenceService.getConversationContextByConversationId.mockResolvedValue([]);
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      await service.run(mockInput, mockContext);

      const resolveOrder =
        messagePersistenceService.resolveConversation.mock.invocationCallOrder[0];
      const createOrder =
        messagePersistenceService.createUserMessage.mock.invocationCallOrder[0];

      expect(resolveOrder).toBeLessThan(createOrder);
    });

    it('does not load old conversation history when a new conversation is resolved', async () => {
      const mockModel = {};
      const oldConversationId = new Types.ObjectId('507f1f77bcf86cd799439098');
      const newConversationId = new Types.ObjectId('507f1f77bcf86cd799439099');

      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
      messagePersistenceService.resolveConversation.mockResolvedValue({
        _id: newConversationId,
      } as any);
      messagePersistenceService.getConversationContextByConversationId.mockImplementation(
        async (conversationId: any) => {
          if (conversationId?.toString() === oldConversationId.toString()) {
            return [{ role: 'user', content: 'old memory' }];
          }

          return [];
        },
      );
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      await service.run(mockInput, mockContext);

      expect(messagePersistenceService.getConversationContextByConversationId).toHaveBeenCalledWith(
        newConversationId,
        expect.anything(),
      );

      const generateTextCall = (ai.generateText as jest.Mock).mock.calls[0][0];
      expect(generateTextCall.messages).toEqual([
        { role: 'user', content: mockInput.message.text },
      ]);
    });
  });
});
