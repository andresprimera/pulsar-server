import { Test, TestingModule } from '@nestjs/testing';
import { MessagePersistenceService } from './message-persistence.service';
import { MessageRepository } from '../../database/repositories/message.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { Types } from 'mongoose';

describe('MessagePersistenceService', () => {
  let service: MessagePersistenceService;
  let messageRepository: jest.Mocked<MessageRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let conversationSummaryService: jest.Mocked<ConversationSummaryService>;

  const mockContext = {
    channelId: 'channel-1',
    agentId: 'agent-1',
    clientId: 'client-1',
    externalUserId: 'user@example.com',
    userName: 'Test User',
  };

  const mockUser = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    externalUserId: 'user@example.com',
    clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    email: 'user@example.com@external.user',
    name: 'Test User',
    status: 'active' as const,
  };

  const mockMessages = [
    {
      _id: new Types.ObjectId(),
      content: 'Previous user message',
      type: 'user' as const,
      userId: mockUser._id,
      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new Types.ObjectId(),
      content: 'Previous agent response',
      type: 'agent' as const,
      userId: mockUser._id,
      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
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
          provide: UserRepository,
          useValue: {
            findOrCreateByExternalUserId: jest.fn(),
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
    userRepository = module.get(UserRepository);
    conversationSummaryService = module.get(ConversationSummaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateUser', () => {
    it('should call userRepository.findOrCreateByExternalUserId', async () => {
      userRepository.findOrCreateByExternalUserId.mockResolvedValue(mockUser as any);

      const result = await service.findOrCreateUser(
        'user@example.com',
        'client-1',
        'Test User',
      );

      expect(userRepository.findOrCreateByExternalUserId).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(Types.ObjectId),
        'Test User',
      );
      expect(result).toEqual(mockUser);
    });
  });

  describe('saveUserMessage', () => {
    it('should save a user message with correct parameters', async () => {
      messageRepository.create.mockResolvedValue({} as any);

      await service.saveUserMessage('Hello!', mockContext, mockUser._id as Types.ObjectId);

      expect(messageRepository.create).toHaveBeenCalledWith({
        content: 'Hello!',
        type: 'user',
        userId: mockUser._id,
        agentId: expect.any(Types.ObjectId),
        clientId: expect.any(Types.ObjectId),
        channelId: expect.any(Types.ObjectId),
        status: 'active',
      });
    });
  });

  describe('saveAgentMessage', () => {
    it('should save an agent message with correct parameters', async () => {
      messageRepository.create.mockResolvedValue({} as any);

      await service.saveAgentMessage('Response!', mockContext, mockUser._id as Types.ObjectId);

      expect(messageRepository.create).toHaveBeenCalledWith({
        content: 'Response!',
        type: 'agent',
        userId: mockUser._id,
        agentId: expect.any(Types.ObjectId),
        clientId: expect.any(Types.ObjectId),
        channelId: expect.any(Types.ObjectId),
        status: 'active',
      });
    });
  });

  describe('getConversationContext', () => {
    it('should retrieve and format conversation context', async () => {
      messageRepository.findConversationContext.mockResolvedValue(mockMessages as any);

      const result = await service.getConversationContext(mockContext, mockUser._id as Types.ObjectId);

      expect(messageRepository.findConversationContext).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        mockUser._id,
        expect.any(Types.ObjectId),
      );
      expect(result).toEqual([
        { role: 'user', content: 'Previous user message' },
        { role: 'assistant', content: 'Previous agent response' },
      ]);
    });

    it('should return empty array when no messages found', async () => {
      messageRepository.findConversationContext.mockResolvedValue([]);

      const result = await service.getConversationContext(mockContext, mockUser._id as Types.ObjectId);

      expect(result).toEqual([]);
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
      service.triggerSummarization(mockContext, mockUser._id as Types.ObjectId, agentContext);

      // Wait a bit for async call
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(conversationSummaryService.checkAndSummarizeIfNeeded).toHaveBeenCalled();
    });
  });

  describe('handleIncomingMessage', () => {
    it('should find/create user, save message, and return context', async () => {
      userRepository.findOrCreateByExternalUserId.mockResolvedValue(mockUser as any);
      messageRepository.create.mockResolvedValue({} as any);
      messageRepository.findConversationContext.mockResolvedValue(mockMessages as any);

      const result = await service.handleIncomingMessage('Hello!', mockContext);

      expect(userRepository.findOrCreateByExternalUserId).toHaveBeenCalled();
      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello!',
          type: 'user',
        }),
      );
      expect(messageRepository.findConversationContext).toHaveBeenCalled();
      expect(result.user).toEqual(mockUser);
      expect(result.conversationHistory).toHaveLength(2);
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
        mockUser._id as Types.ObjectId,
        agentContext,
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
