import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  MessageIdempotencyConflictError,
  MessageRepository,
} from './message.repository';
import { Message } from '@persistence/schemas/message.schema';
import { Types } from 'mongoose';

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let mockModel: any;

  const mockChannelId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockContactId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockAgentId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const mockClientId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const mockConversationId = new Types.ObjectId('507f1f77bcf86cd799439015');

  const mockUserMessage = {
    _id: new Types.ObjectId(),
    content: 'Hello, this is a test message',
    type: 'user' as const,
    contactId: mockContactId,
    clientId: mockClientId,
    channelId: mockChannelId,
    conversationId: mockConversationId,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAgentMessage = {
    _id: new Types.ObjectId(),
    content: 'Hello, this is an agent response',
    type: 'agent' as const,
    agentId: mockAgentId,
    clientId: mockClientId,
    channelId: mockChannelId,
    conversationId: mockConversationId,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSummaryMessage = {
    _id: new Types.ObjectId(),
    content: 'This is a summary of the previous conversation',
    type: 'summary' as const,
    agentId: mockAgentId,
    clientId: mockClientId,
    channelId: mockChannelId,
    conversationId: mockConversationId,
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
    it('should reject create when conversationId is null', async () => {
      await expect(
        repository.create({
          ...mockAgentMessage,
          conversationId: null as any,
        }),
      ).rejects.toThrow('conversationId is required');

      expect(mockModel.create).not.toHaveBeenCalled();
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
          exec: jest
            .fn()
            .mockResolvedValue([mockUserMessage, mockAgentMessage]),
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

  describe('findByContact', () => {
    it('should return messages for a contact sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUserMessage]),
        }),
      });

      const result = await repository.findByContact(mockContactId);

      expect(mockModel.find).toHaveBeenCalledWith({ contactId: mockContactId });
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

  describe('findByChannelAndContact', () => {
    it('should return conversation history for a channel and contact', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUserMessage]),
        }),
      });

      const result = await repository.findByChannelAndContact(
        mockChannelId,
        mockContactId,
      );

      expect(mockModel.find).toHaveBeenCalledWith({
        channelId: mockChannelId,
        contactId: mockContactId,
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

      const result = await repository.update(mockUserMessage._id.toString(), {
        content: 'Updated content',
      });

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
        mockConversationId,
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
        mockConversationId,
        mockAgentId,
      );

      expect(result).toEqual([mockUserMessage, mockAgentMessage]);
    });
  });

  describe('Phase 2 operator outbound methods', () => {
    const mockOperatorMessage = {
      _id: new Types.ObjectId(),
      content: 'Operator reply',
      type: 'human' as const,
      authorClientUserId: new Types.ObjectId('507f1f77bcf86cd799439020'),
      clientId: mockClientId,
      channelId: mockChannelId,
      conversationId: mockConversationId,
      status: 'active' as const,
      deliveryStatus: 'pending' as const,
      idempotencyKey: 'abcdef12-3456-4789-abcd-ef0123456789',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('findByConversationPage', () => {
      it("filters with type $in ['user','agent','human'] and includes new fields in the projection", async () => {
        const sortMock = jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([mockUserMessage]),
            }),
          }),
        });
        mockModel.find.mockReturnValueOnce({ sort: sortMock });

        await repository.findByConversationPage(mockConversationId, {
          cursor: null,
          limit: 10,
        });

        const [filter, projection] = mockModel.find.mock.calls[0];
        expect(filter).toEqual(
          expect.objectContaining({
            conversationId: mockConversationId,
            status: 'active',
            type: { $in: ['user', 'agent', 'human'] },
          }),
        );
        expect(projection).toEqual(
          expect.objectContaining({
            authorClientUserId: 1,
            deliveryStatus: 1,
          }),
        );
      });
    });

    describe('createOperatorMessage', () => {
      it('inserts a human-typed row with deliveryStatus: pending and the idempotencyKey', async () => {
        mockModel.create.mockResolvedValueOnce([mockOperatorMessage]);
        const result = await repository.createOperatorMessage({
          conversationId: mockConversationId,
          clientId: mockClientId,
          channelId: mockChannelId,
          authorClientUserId:
            mockOperatorMessage.authorClientUserId as Types.ObjectId,
          content: 'Operator reply',
          idempotencyKey: mockOperatorMessage.idempotencyKey,
        });
        const [payloadArray] = mockModel.create.mock.calls[0];
        expect(payloadArray).toHaveLength(1);
        expect(payloadArray[0]).toEqual(
          expect.objectContaining({
            type: 'human',
            status: 'active',
            deliveryStatus: 'pending',
            idempotencyKey: mockOperatorMessage.idempotencyKey,
          }),
        );
        expect(result).toEqual(mockOperatorMessage);
      });

      it('translates Mongo E11000 to MessageIdempotencyConflictError', async () => {
        const dupErr: any = new Error('E11000 duplicate key');
        dupErr.code = 11000;
        mockModel.create.mockRejectedValueOnce(dupErr);

        await expect(
          repository.createOperatorMessage({
            conversationId: mockConversationId,
            clientId: mockClientId,
            channelId: mockChannelId,
            authorClientUserId:
              mockOperatorMessage.authorClientUserId as Types.ObjectId,
            content: 'x',
            idempotencyKey: mockOperatorMessage.idempotencyKey,
          }),
        ).rejects.toBeInstanceOf(MessageIdempotencyConflictError);
      });

      it('rethrows non-duplicate errors as-is', async () => {
        const otherErr = new Error('boom');
        mockModel.create.mockRejectedValueOnce(otherErr);

        await expect(
          repository.createOperatorMessage({
            conversationId: mockConversationId,
            clientId: mockClientId,
            channelId: mockChannelId,
            authorClientUserId:
              mockOperatorMessage.authorClientUserId as Types.ObjectId,
            content: 'x',
            idempotencyKey: mockOperatorMessage.idempotencyKey,
          }),
        ).rejects.toBe(otherErr);
      });
    });

    describe('findByIdempotencyKey', () => {
      it('returns the prior row when one exists', async () => {
        mockModel.findOne.mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockOperatorMessage),
          }),
        });

        const result = await repository.findByIdempotencyKey(
          mockConversationId,
          mockOperatorMessage.idempotencyKey,
        );

        expect(mockModel.findOne).toHaveBeenCalledWith({
          conversationId: mockConversationId,
          idempotencyKey: mockOperatorMessage.idempotencyKey,
        });
        expect(result).toEqual(mockOperatorMessage);
      });

      it('returns null when no prior row exists', async () => {
        mockModel.findOne.mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        });

        const result = await repository.findByIdempotencyKey(
          mockConversationId,
          'unknown-key',
        );
        expect(result).toBeNull();
      });
    });

    describe('updateDeliveryStatus', () => {
      it('updates the row and returns the updated document', async () => {
        const updated = { ...mockOperatorMessage, deliveryStatus: 'sent' };
        mockModel.findByIdAndUpdate.mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(updated),
        });

        const messageId = mockOperatorMessage._id as Types.ObjectId;
        const result = await repository.updateDeliveryStatus(messageId, 'sent');

        expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
          messageId,
          { $set: { deliveryStatus: 'sent' } },
          { new: true },
        );
        expect(result).toEqual(updated);
      });
    });
  });

  describe('countTokensInConversation', () => {
    it('should estimate token count from messages', async () => {
      const messages = [
        { ...mockUserMessage, content: 'Hello world' }, // 2 words
        { ...mockAgentMessage, content: 'Hi there how are you' }, // 5 words
      ];

      jest
        .spyOn(repository, 'findConversationContext')
        .mockResolvedValue(messages as any);

      const result = await repository.countTokensInConversation(
        mockConversationId,
        mockAgentId,
      );

      // Total words: 7, estimated tokens: 7 * 1.3 = 9.1, ceil = 10
      expect(result).toBe(10);
    });

    it('should return 0 for empty conversation', async () => {
      jest.spyOn(repository, 'findConversationContext').mockResolvedValue([]);

      const result = await repository.countTokensInConversation(
        mockConversationId,
        mockAgentId,
      );

      expect(result).toBe(0);
    });
  });
});
