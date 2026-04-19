import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ConversationSummaryService } from './conversation-summary.service';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { LlmUsageLogRepository } from '@persistence/repositories/llm-usage-log.repository';
import { Types } from 'mongoose';
import * as ai from 'ai';
import * as llmFactory from './llm/llm.factory';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('./llm/llm.factory', () => ({
  createLLMModel: jest.fn(),
}));

describe('ConversationSummaryService', () => {
  let service: ConversationSummaryService;
  let messageRepository: jest.Mocked<MessageRepository>;
  let configService: jest.Mocked<ConfigService>;
  let llmUsageLogRepository: jest.Mocked<LlmUsageLogRepository>;
  let loggerErrorSpy: jest.SpyInstance;

  const mockChannelId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockConversationId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockAgentId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const mockClientId = new Types.ObjectId('507f1f77bcf86cd799439014');

  const mockContext = {
    agentId: mockAgentId.toString(),
    clientId: mockClientId.toString(),
    channelId: mockChannelId.toString(),
    systemPrompt: 'You are a helpful assistant',
    toolingProfileId: 'standard' as const,
    llmConfig: {
      provider: 'openai' as any,
      apiKey: 'test-key',
      model: 'gpt-4',
    },
  };

  const mockMessages = [
    {
      _id: new Types.ObjectId(),
      content: 'User message 1',
      type: 'user' as const,
      agentId: mockAgentId,
      clientId: mockClientId,
      channelId: mockChannelId,
      conversationId: mockConversationId,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new Types.ObjectId(),
      content: 'Agent response 1',
      type: 'agent' as const,
      agentId: mockAgentId,
      clientId: mockClientId,
      channelId: mockChannelId,
      conversationId: mockConversationId,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationSummaryService,
        {
          provide: MessageRepository,
          useValue: {
            countTokensInConversation: jest.fn(),
            findConversationContext: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LlmUsageLogRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<ConversationSummaryService>(
      ConversationSummaryService,
    );
    messageRepository = module.get(MessageRepository);
    configService = module.get(ConfigService);
    llmUsageLogRepository = module.get(LlmUsageLogRepository);
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    jest.clearAllMocks();
  });

  afterEach(() => {
    loggerErrorSpy?.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAndSummarizeIfNeeded', () => {
    it('should not generate summary if token count is below threshold', async () => {
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(1000);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(messageRepository.countTokensInConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockAgentId,
      );
      expect(messageRepository.findConversationContext).not.toHaveBeenCalled();
      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('should generate summary if token count exceeds threshold', async () => {
      const mockModel = {};
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(2500);
      messageRepository.findConversationContext.mockResolvedValue(
        mockMessages as any,
      );
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({
        text: 'This is a summary of the conversation',
      });
      messageRepository.create.mockResolvedValue({} as any);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(messageRepository.countTokensInConversation).toHaveBeenCalled();
      expect(messageRepository.findConversationContext).toHaveBeenCalled();
      expect(llmFactory.createLLMModel).toHaveBeenCalledWith(
        mockContext.llmConfig,
      );
      expect(ai.generateText).toHaveBeenCalled();
      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'summary',
          content: 'This is a summary of the conversation',
          agentId: mockAgentId,
          clientId: expect.any(Types.ObjectId),
          channelId: mockChannelId,
          conversationId: mockConversationId,
          status: 'active',
        }),
      );
    });

    it('should handle empty message list gracefully', async () => {
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(2500);
      messageRepository.findConversationContext.mockResolvedValue([]);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('should handle LLM errors gracefully', async () => {
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(2500);
      messageRepository.findConversationContext.mockResolvedValue(
        mockMessages as any,
      );
      (llmFactory.createLLMModel as jest.Mock).mockImplementation(() => {
        throw new Error('LLM error');
      });

      // Should not throw
      await expect(
        service.checkAndSummarizeIfNeeded(
          mockConversationId,
          mockAgentId,
          mockContext,
        ),
      ).resolves.not.toThrow();
    });

    it('should use default threshold of 2000 if not configured', async () => {
      configService.get.mockReturnValue(undefined);
      messageRepository.countTokensInConversation.mockResolvedValue(1000);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(configService.get).toHaveBeenCalledWith(
        'CONVERSATION_TOKEN_THRESHOLD',
        2000,
      );
    });

    it('should log LLM usage with operationType summary', async () => {
      const mockModel = {};
      const mockUsage = {
        inputTokens: 200,
        outputTokens: 80,
        totalTokens: 280,
      };
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(2500);
      messageRepository.findConversationContext.mockResolvedValue(
        mockMessages as any,
      );
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({
        text: 'Summary text',
        usage: mockUsage,
      });
      messageRepository.create.mockResolvedValue({} as any);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(llmUsageLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: mockAgentId,
          conversationId: mockConversationId,
          provider: mockContext.llmConfig.provider,
          llmModel: mockContext.llmConfig.model,
          inputTokens: 200,
          outputTokens: 80,
          totalTokens: 280,
          operationType: 'summary',
        }),
      );
    });

    it('should not log usage when usage data is not returned', async () => {
      const mockModel = {};
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(2500);
      messageRepository.findConversationContext.mockResolvedValue(
        mockMessages as any,
      );
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({
        text: 'Summary text',
        usage: undefined,
      });
      messageRepository.create.mockResolvedValue({} as any);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(llmUsageLogRepository.create).not.toHaveBeenCalled();
    });

    it('should handle empty/whitespace summary from LLM', async () => {
      const mockModel = {};
      configService.get.mockReturnValue(2000);
      messageRepository.countTokensInConversation.mockResolvedValue(2500);
      messageRepository.findConversationContext.mockResolvedValue(
        mockMessages as any,
      );
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });
      messageRepository.create.mockResolvedValue({} as any);

      await service.checkAndSummarizeIfNeeded(
        mockConversationId,
        mockAgentId,
        mockContext,
      );

      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Unable to generate summary',
        }),
      );
    });
  });
});
