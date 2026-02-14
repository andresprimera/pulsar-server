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

  const mockMessage = {
    _id: new Types.ObjectId(),
    content: 'Hello, this is a test message',
    userId: mockUserId,
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
    it('should create and return new message', async () => {
      mockModel.create.mockResolvedValue([mockMessage]);

      const result = await repository.create(mockMessage);

      expect(mockModel.create).toHaveBeenCalledWith([mockMessage], {
        session: undefined,
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('findAll', () => {
    it('should return all messages', async () => {
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockMessage]),
      });

      const result = await repository.findAll();

      expect(mockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('findById', () => {
    it('should return message when exists', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockMessage),
      });

      const result = await repository.findById(mockMessage._id.toString());

      expect(mockModel.findById).toHaveBeenCalledWith(
        mockMessage._id.toString(),
      );
      expect(result).toEqual(mockMessage);
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
          exec: jest.fn().mockResolvedValue([mockMessage]),
        }),
      });

      const result = await repository.findByChannel(mockChannelId);

      expect(mockModel.find).toHaveBeenCalledWith({
        channelId: mockChannelId,
      });
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('findByUser', () => {
    it('should return messages for a user sorted by creation date', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockMessage]),
        }),
      });

      const result = await repository.findByUser(mockUserId);

      expect(mockModel.find).toHaveBeenCalledWith({ userId: mockUserId });
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('findByChannelAndUser', () => {
    it('should return conversation history for a channel and user', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockMessage]),
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
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('findByStatus', () => {
    it('should return messages filtered by status', async () => {
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockMessage]),
      });

      const result = await repository.findByStatus('active');

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('update', () => {
    it('should update and return message', async () => {
      const updatedMessage = { ...mockMessage, content: 'Updated content' };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedMessage),
      });

      const result = await repository.update(mockMessage._id.toString(), {
        content: 'Updated content',
      });

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockMessage._id.toString(),
        { content: 'Updated content' },
        { new: true },
      );
      expect(result).toEqual(updatedMessage);
    });
  });
});
