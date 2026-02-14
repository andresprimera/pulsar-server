import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MessageRepository } from './message.repository';
import { Message } from '../schemas/message.schema';
import { Types } from 'mongoose';

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let mockModel: any;

  const mockChannelId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockAgentId = new Types.ObjectId('507f1f77bcf86cd799439013');

  const mockUserMessage = {
    _id: new Types.ObjectId(),
    content: 'Hello, this is a test message',
    type: 'user' as const,
    userId: mockUserId,
    channelId: mockChannelId,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAgentMessage = {
    _id: new Types.ObjectId(),
    content: 'Hello, this is an agent response',
    type: 'agent' as const,
    agentId: mockAgentId,
    channelId: mockChannelId,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSummaryMessage = {
    _id: new Types.ObjectId(),
    content: 'This is a summary of the previous conversation',
    type: 'summary' as const,
    agentId: mockAgentId,
    channelId: mockChannelId,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageRepository,
        {
          provide: getModelToken(Message.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = module.get<MessageRepository>(MessageRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create and return new user message', async () => {
      mockModel.create.mockResolvedValue([mockUserMessage]);

      const result = await repository.create(mockUserMessage);

      expect(mockModel.create).toHaveBeenCalledWith([mockUserMessage], {
        session: undefined,
      });
      expect(result).toEqual(mockUserMessage);
    });

    it('should create and return new agent message', async () => {
      mockModel.create.mockResolvedValue([mockAgentMessage]);

      const result = await repository.create(mockAgentMessage);

      expect(mockModel.create).toHaveBeenCalledWith([mockAgentMessage], {
        session: undefined,
      });
      expect(result).toEqual(mockAgentMessage);
    });

    it('should create and return new summary message', async () => {
      mockModel.create.mockResolvedValue([mockSummaryMessage]);

      const result = await repository.create(mockSummaryMessage);

      expect(mockModel.create).toHaveBeenCalledWith([mockSummaryMessage], {
        session: undefined,
      });
      expect(result).toEqual(mockSummaryMessage);
    });
  });

  describe('findAll', () => {
    it('should return all messages sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUserMessage, mockAgentMessage]),
        }),
      });

      const result = await repository.findAll();

      expect(mockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockUserMessage, mockAgentMessage]);
    });
  });

  describe('findById', () => {
    it('should return message when exists', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUserMessage),
      });

      const result = await repository.findById(mockUserMessage._id.toString());

      expect(mockModel.findById).toHaveBeenCalledWith(
        mockUserMessage._id.toString(),
      );
      expect(result).toEqual(mockUserMessage);
    });

    it('should return null when not exists', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByChannel', () => {
    it('should return messages for a channel sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([mockUserMessage, mockAgentMessage]),
        }),
      });

      const result = await repository.findByChannel(mockChannelId);

      expect(mockModel.find).toHaveBeenCalledWith({
        channelId: mockChannelId,
      });
      expect(result).toEqual([mockUserMessage, mockAgentMessage]);
    });
  });

  describe('findByUser', () => {
    it('should return messages for a user sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUserMessage]),
        }),
      });

      const result = await repository.findByUser(mockUserId);

      expect(mockModel.find).toHaveBeenCalledWith({ userId: mockUserId });
      expect(result).toEqual([mockUserMessage]);
    });
  });

  describe('findByAgent', () => {
    it('should return messages for an agent sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockAgentMessage]),
        }),
      });

      const result = await repository.findByAgent(mockAgentId);

      expect(mockModel.find).toHaveBeenCalledWith({ agentId: mockAgentId });
      expect(result).toEqual([mockAgentMessage]);
    });
  });

  describe('findByChannelAndUser', () => {
    it('should return conversation history for a channel and user', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUserMessage]),
        }),
      });

      const result = await repository.findByChannelAndUser(
        mockChannelId,
        mockUserId,
      );

      expect(mockModel.find).toHaveBeenCalledWith({
        channelId: mockChannelId,
        userId: mockUserId,
      });
      expect(result).toEqual([mockUserMessage]);
    });
  });

  describe('findByType', () => {
    it('should return user messages when type is user', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUserMessage]),
        }),
      });

      const result = await repository.findByType('user');

      expect(mockModel.find).toHaveBeenCalledWith({ type: 'user' });
      expect(result).toEqual([mockUserMessage]);
    });

    it('should return agent messages when type is agent', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockAgentMessage]),
        }),
      });

      const result = await repository.findByType('agent');

      expect(mockModel.find).toHaveBeenCalledWith({ type: 'agent' });
      expect(result).toEqual([mockAgentMessage]);
    });

    it('should return summary messages when type is summary', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockSummaryMessage]),
        }),
      });

      const result = await repository.findByType('summary');

      expect(mockModel.find).toHaveBeenCalledWith({ type: 'summary' });
      expect(result).toEqual([mockSummaryMessage]);
    });
  });

  describe('findByStatus', () => {
    it('should return messages filtered by status sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([mockUserMessage, mockAgentMessage]),
        }),
      });

      const result = await repository.findByStatus('active');

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toEqual([mockUserMessage, mockAgentMessage]);
    });
  });

  describe('update', () => {
    it('should update and return message', async () => {
      const updatedMessage = {
        ...mockUserMessage,
        content: 'Updated content',
      };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedMessage),
      });

      const result = await repository.update(
        mockUserMessage._id.toString(),
        {
          content: 'Updated content',
        },
      );

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUserMessage._id.toString(),
        { content: 'Updated content' },
        { new: true },
      );
      expect(result).toEqual(updatedMessage);
    });
  });

  describe('findConversationContext', () => {
    it('should return messages after last summary', async () => {
      const lastSummary = {
        ...mockSummaryMessage,
        createdAt: new Date('2024-01-01'),
      };

      // First call: findOne for last summary
      mockModel.findOne.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(lastSummary),
        }),
      });

      // Second call: find for messages after summary
      mockModel.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([mockUserMessage, mockAgentMessage]),
        }),
      });

      const result = await repository.findConversationContext(
        mockChannelId,
        mockUserId,
        mockAgentId,
      );

      expect(result).toEqual([mockUserMessage, mockAgentMessage]);
    });

    it('should return all messages when no summary exists', async () => {
      // First call: findOne for last summary - returns null
      mockModel.findOne.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      // Second call: find for all messages
      mockModel.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([mockUserMessage, mockAgentMessage]),
        }),
      });

      const result = await repository.findConversationContext(
        mockChannelId,
        mockUserId,
        mockAgentId,
      );

      expect(result).toEqual([mockUserMessage, mockAgentMessage]);
    });
  });

  describe('countTokensInConversation', () => {
    it('should estimate token count from messages', async () => {
      const messages = [
        { ...mockUserMessage, content: 'Hello world' }, // 2 words
        { ...mockAgentMessage, content: 'Hi there how are you' }, // 5 words
      ];

      jest.spyOn(repository, 'findConversationContext').mockResolvedValue(messages as any);

      const result = await repository.countTokensInConversation(
        mockChannelId,
        mockUserId,
        mockAgentId,
      );

      // Total words: 7, estimated tokens: 7 * 1.3 = 9.1, ceil = 10
      expect(result).toBe(10);
    });

    it('should return 0 for empty conversation', async () => {
      jest.spyOn(repository, 'findConversationContext').mockResolvedValue([]);

      const result = await repository.countTokensInConversation(
        mockChannelId,
        mockUserId,
        mockAgentId,
      );

      expect(result).toBe(0);
    });
  });
});
