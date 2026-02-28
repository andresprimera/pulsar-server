import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { AgentInput } from './contracts/agent-input';
import { AgentContext } from './contracts/agent-context';
import { LlmProvider } from './llm/provider.enum';
import { MessagePersistenceService } from '../channels/shared/message-persistence.service';
import * as llmFactory from './llm/llm.factory';
import * as ai from 'ai';
import { Logger } from '@nestjs/common';

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
    conversationId: 'phone123:1234567890',
    message: { type: 'text', text: 'Hello, world!' },
  };

  const mockContext: AgentContext = {
    agentId: 'agent-1',
    clientId: 'client-1',
    channelId: 'channel-1',
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
    clientId: 'client-1',
    channelId: 'channel-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: MessagePersistenceService,
          useValue: {
            createUserMessage: jest.fn(),
            getConversationContext: jest.fn(),
            handleOutgoingMessage: jest.fn(),
          },
        },
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
      const conversationHistory = [
        { role: 'user' as const, content: 'Previous message' },
      ];

      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContext.mockResolvedValue(
        conversationHistory,
      );
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      const result = await service.run(mockInput, mockContext);

      expect(messagePersistenceService.createUserMessage).toHaveBeenCalledWith(
        'Hello, world!',
        {
          channelId: 'channel-1',
          agentId: 'agent-1',
          clientId: 'client-1',
          contactId: '507f1f77bcf86cd799439012',
        },
        expect.anything(),
      );

      expect(messagePersistenceService.getConversationContext).toHaveBeenCalledWith(
        {
          channelId: 'channel-1',
          agentId: 'agent-1',
          clientId: 'client-1',
          contactId: '507f1f77bcf86cd799439012',
        },
        expect.anything(),
      );

      expect(llmFactory.createLLMModel).toHaveBeenCalledWith(
        mockContext.llmConfig,
      );
      expect(ai.generateText).toHaveBeenCalledWith({
        model: mockModel,
        system: mockContext.systemPrompt,
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
          channelId: 'channel-1',
          agentId: 'agent-1',
          clientId: 'client-1',
          contactId: '507f1f77bcf86cd799439012',
        },
        expect.anything(),
        mockContext,
      );

      expect(result).toEqual({
        reply: { type: 'text', text: 'AI response' },
      });
    });

    it('should return fallback for empty AI response', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContext.mockResolvedValue([]);
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
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContext.mockResolvedValue([]);

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
      messagePersistenceService.createUserMessage.mockResolvedValue();
      messagePersistenceService.getConversationContext.mockResolvedValue([]);
      messagePersistenceService.handleOutgoingMessage.mockResolvedValue();

      await service.run(mockInput, mockContext);

      expect(logSpy).toHaveBeenCalledWith(
        'Processing agent-1 for client client-1 using provider=openai model=gpt-4',
      );
      expect(logSpy).toHaveBeenCalledWith('Response generated for agent-1');
    });
  });
});
