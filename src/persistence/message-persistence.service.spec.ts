import { Test, TestingModule } from '@nestjs/testing';
import { MessagePersistenceService } from './message-persistence.service';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { ConversationSummaryService } from '@agent/conversation-summary.service';
import { Types } from 'mongoose';
import { ConversationService } from '@domain/conversation/conversation.service';

describe('MessagePersistenceService', () => {
  let service: MessagePersistenceService;
  let messageRepository: jest.Mocked<MessageRepository>;
  let conversationSummaryService: jest.Mocked<ConversationSummaryService>;
  let conversationService: jest.Mocked<ConversationService>;
  const mockConversationId = new Types.ObjectId('507f1f77bcf86cd799439015');

  const mockContext = {
    channelId: '507f1f77bcf86cd799439014',
    agentId: '507f1f77bcf86cd799439013',
    clientId: '507f1f77bcf86cd799439011',
    contactId: '507f1f77bcf86cd799439012',
  };

  const mockContact = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    externalId: 'user@example.com',
    clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
    name: 'Test User',
    status: 'active' as const,
  };

  const mockMessages = [
    {
      _id: new Types.ObjectId(),
      content: 'Previous user message',
      type: 'user' as const,
      contactId: mockContact._id,
      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      conversationId: mockConversationId,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new Types.ObjectId(),
      content: 'Previous agent response',
      type: 'agent' as const,
      contactId: mockContact._id,
      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      conversationId: mockConversationId,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagePersistenceService,
        {
          provide: MessageRepository,
          useValue: {
            create: jest.fn(),
            findConversationContext: jest.fn(),
          },
        },
        {
          provide: ConversationService,
          useValue: {
            resolveOrCreate: jest.fn(),
            touch: jest.fn(),
          },
        },
        {
          provide: ConversationSummaryService,
          useValue: {
            checkAndSummarizeIfNeeded: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MessagePersistenceService>(MessagePersistenceService);
    messageRepository = module.get(MessageRepository);
    conversationService = module.get(ConversationService);
    conversationSummaryService = module.get(ConversationSummaryService);

    conversationService.resolveOrCreate.mockResolvedValue({
      _id: mockConversationId,
      status: 'open',
      lastMessageAt: new Date(),
    } as any);
    conversationService.touch.mockResolvedValue();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUserMessage', () => {
    it('should save a user message with correct parameters', async () => {
      messageRepository.create.mockResolvedValue({} as any);

      await service.createUserMessage(
        'Hello!',
        mockContext,
        mockContact._id as Types.ObjectId,
      );

      expect(messageRepository.create).toHaveBeenCalledWith({
        content: 'Hello!',
        type: 'user',
        contactId: mockContact._id,
        agentId: expect.any(Types.ObjectId),
        clientId: expect.any(Types.ObjectId),
        channelId: expect.any(Types.ObjectId),
        conversationId: mockConversationId,
        status: 'active',
      });
      expect(conversationService.touch).toHaveBeenCalledWith(
        mockConversationId,
        expect.any(Date),
      );

      const resolveOrder =
        conversationService.resolveOrCreate.mock.invocationCallOrder[0];
      const createOrder = messageRepository.create.mock.invocationCallOrder[0];
      const touchOrder = conversationService.touch.mock.invocationCallOrder[0];

      expect(resolveOrder).toBeLessThan(createOrder);
      expect(createOrder).toBeLessThan(touchOrder);
    });

    it('should not allow createUserMessage when resolved conversation has no id', async () => {
      conversationService.resolveOrCreate.mockResolvedValue({
        _id: undefined,
      } as any);
      messageRepository.create.mockImplementation(async (payload: any) => {
        if (!payload?.conversationId) {
          throw new Error('conversationId is required');
        }
        return {} as any;
      });

      await expect(
        service.createUserMessage(
          'Hello!',
          mockContext,
          mockContact._id as Types.ObjectId,
        ),
      ).rejects.toThrow('conversationId is required');

      expect(messageRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveAgentMessage', () => {
    it('should save an agent message with correct parameters', async () => {
      messageRepository.create.mockResolvedValue({} as any);

      await service.saveAgentMessage(
        'Response!',
        mockContext,
        mockContact._id as Types.ObjectId,
      );

      expect(messageRepository.create).toHaveBeenCalledWith({
        content: 'Response!',
        type: 'agent',
        contactId: mockContact._id,
        agentId: expect.any(Types.ObjectId),
        clientId: expect.any(Types.ObjectId),
        channelId: expect.any(Types.ObjectId),
        conversationId: mockConversationId,
        status: 'active',
      });
      expect(conversationService.touch).toHaveBeenCalledWith(
        mockConversationId,
        expect.any(Date),
      );

      const resolveOrder =
        conversationService.resolveOrCreate.mock.invocationCallOrder[0];
      const createOrder = messageRepository.create.mock.invocationCallOrder[0];
      const touchOrder = conversationService.touch.mock.invocationCallOrder[0];

      expect(resolveOrder).toBeLessThan(createOrder);
      expect(createOrder).toBeLessThan(touchOrder);
    });
  });

  describe('getConversationContextByConversationId', () => {
    it('should retrieve and format conversation context', async () => {
      messageRepository.findConversationContext.mockResolvedValue(
        mockMessages as any,
      );

      const result = await service.getConversationContextByConversationId(
        mockConversationId,
        new Types.ObjectId(mockContext.agentId),
      );

      expect(messageRepository.findConversationContext).toHaveBeenCalledWith(
        mockConversationId,
        expect.any(Types.ObjectId),
      );
      expect(result).toEqual([
        { role: 'user', content: 'Previous user message' },
        { role: 'assistant', content: 'Previous agent response' },
      ]);
    });

    it('should return empty array when no messages found', async () => {
      messageRepository.findConversationContext.mockResolvedValue([]);

      const result = await service.getConversationContextByConversationId(
        mockConversationId,
        new Types.ObjectId(mockContext.agentId),
      );

      expect(result).toEqual([]);
    });
  });

  describe('identity guard', () => {
    it('should throw when contactId is missing for user message creation', async () => {
      await expect(
        service.createUserMessage('Hello!', mockContext, undefined as any),
      ).rejects.toThrow('Identity must be resolved before message creation');
    });

    it('should throw when context.contactId is missing', async () => {
      const invalidContext = {
        ...mockContext,
        contactId: undefined as any,
      };

      await expect(
        service.createUserMessage(
          'Hello!',
          invalidContext,
          mockContact._id as Types.ObjectId,
        ),
      ).rejects.toThrow('Identity must be resolved before message creation');
    });

    it('should throw when contactId does not match context.contactId', async () => {
      const mismatchedContactId = new Types.ObjectId(
        '507f1f77bcf86cd799439099',
      );

      await expect(
        service.createUserMessage('Hello!', mockContext, mismatchedContactId),
      ).rejects.toThrow('Identity must be resolved before message creation');
    });
  });

  describe('triggerSummarization', () => {
    it('should call conversationSummaryService without blocking', async () => {
      conversationSummaryService.checkAndSummarizeIfNeeded.mockResolvedValue();

      const agentContext = {
        agentId: 'agent-1',
        clientId: 'client-1',
        channelId: 'channel-1',
        systemPrompt: 'Test prompt',
        llmConfig: {
          provider: 'openai' as any,
          apiKey: 'test-key',
          model: 'gpt-4',
        },
      };

      // Should not throw even if summarization fails
      service.triggerSummarization(
        mockConversationId,
        new Types.ObjectId(mockContext.agentId),
        agentContext,
      );

      // Wait a bit for async call
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(
        conversationSummaryService.checkAndSummarizeIfNeeded,
      ).toHaveBeenCalled();
    });
  });

  describe('handleOutgoingMessage', () => {
    it('should save agent message and trigger summarization', async () => {
      messageRepository.create.mockResolvedValue({} as any);
      conversationSummaryService.checkAndSummarizeIfNeeded.mockResolvedValue();

      const agentContext = {
        agentId: 'agent-1',
        clientId: 'client-1',
        channelId: 'channel-1',
        systemPrompt: 'Test prompt',
        llmConfig: {
          provider: 'openai' as any,
          apiKey: 'test-key',
          model: 'gpt-4',
        },
      };

      await service.handleOutgoingMessage(
        'Response!',
        mockContext,
        mockContact._id as Types.ObjectId,
        agentContext,
        mockConversationId,
      );

      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Response!',
          type: 'agent',
        }),
      );
    });
  });
});
