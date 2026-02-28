import { Test, TestingModule } from '@nestjs/testing';
import { MessagePersistenceService } from './message-persistence.service';
import { MessageRepository } from '../../database/repositories/message.repository';
import { ContactRepository } from '../../database/repositories/contact.repository';
import { ConversationSummaryService } from '../../agent/conversation-summary.service';
import { Types } from 'mongoose';

describe('MessagePersistenceService', () => {
  let service: MessagePersistenceService;
  let messageRepository: jest.Mocked<MessageRepository>;
  let contactRepository: jest.Mocked<ContactRepository>;
  let conversationSummaryService: jest.Mocked<ConversationSummaryService>;

  const mockContext = {
    channelId: '507f1f77bcf86cd799439014',
    agentId: '507f1f77bcf86cd799439013',
    clientId: '507f1f77bcf86cd799439011',
    externalUserId: 'user@example.com',
    channelType: 'whatsapp' as const,
    userName: 'Test User',
  };

  const mockContact = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    externalUserId: 'user@example.com',
    clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    channelType: 'whatsapp' as const,
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
          provide: ContactRepository,
          useValue: {
            findOrCreate: jest.fn(),
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
    contactRepository = module.get(ContactRepository);
    conversationSummaryService = module.get(ConversationSummaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateContact', () => {
    it('should call contactRepository.findOrCreate', async () => {
      contactRepository.findOrCreate.mockResolvedValue(mockContact as any);

      const result = await service.findOrCreateContact(
        'user@example.com',
        '507f1f77bcf86cd799439011',
        'whatsapp',
        'Test User',
      );

      expect(contactRepository.findOrCreate).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(Types.ObjectId),
        'whatsapp',
        'Test User',
      );
      expect(result).toEqual(mockContact);
    });
  });

  describe('saveUserMessage', () => {
    it('should save a user message with correct parameters', async () => {
      messageRepository.create.mockResolvedValue({} as any);

      await service.saveUserMessage('Hello!', mockContext, mockContact._id as Types.ObjectId);

      expect(messageRepository.create).toHaveBeenCalledWith({
        content: 'Hello!',
        type: 'user',
        contactId: mockContact._id,
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

      await service.saveAgentMessage('Response!', mockContext, mockContact._id as Types.ObjectId);

      expect(messageRepository.create).toHaveBeenCalledWith({
        content: 'Response!',
        type: 'agent',
        contactId: mockContact._id,
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

      const result = await service.getConversationContext(mockContext, mockContact._id as Types.ObjectId);

      expect(messageRepository.findConversationContext).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        mockContact._id,
        expect.any(Types.ObjectId),
      );
      expect(result).toEqual([
        { role: 'user', content: 'Previous user message' },
        { role: 'assistant', content: 'Previous agent response' },
      ]);
    });

    it('should return empty array when no messages found', async () => {
      messageRepository.findConversationContext.mockResolvedValue([]);

      const result = await service.getConversationContext(mockContext, mockContact._id as Types.ObjectId);

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
      service.triggerSummarization(mockContext, mockContact._id as Types.ObjectId, agentContext);

      // Wait a bit for async call
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(conversationSummaryService.checkAndSummarizeIfNeeded).toHaveBeenCalled();
    });
  });

  describe('handleIncomingMessage', () => {
    it('should find/create contact, save message, and return context', async () => {
      contactRepository.findOrCreate.mockResolvedValue(mockContact as any);
      messageRepository.create.mockResolvedValue({} as any);
      messageRepository.findConversationContext.mockResolvedValue(mockMessages as any);

      const result = await service.handleIncomingMessage('Hello!', mockContext);

      expect(contactRepository.findOrCreate).toHaveBeenCalled();
      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello!',
          type: 'user',
        }),
      );
      expect(messageRepository.findConversationContext).toHaveBeenCalled();
      expect(result.contact).toEqual(mockContact);
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
        mockContact._id as Types.ObjectId,
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
