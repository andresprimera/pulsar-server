import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InboxService } from './inbox.service';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { Conversation } from '@persistence/schemas/conversation.schema';
import { Message } from '@persistence/schemas/message.schema';

type ConversationRow = Partial<Conversation> & {
  _id: Types.ObjectId;
  contactId: Types.ObjectId;
  channelId: Types.ObjectId;
  clientId: Types.ObjectId;
  status: 'open' | 'closed' | 'archived';
  controlMode?: 'bot' | 'human';
  lastMessageAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

type MessageRow = Partial<Message> & {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  content: string;
  type: 'user' | 'agent' | 'summary';
  contactId?: Types.ObjectId;
  agentId?: Types.ObjectId;
  createdAt?: Date;
};

const buildConversationRow = (
  overrides: Partial<ConversationRow> = {},
): ConversationRow => ({
  _id: new Types.ObjectId(),
  clientId: new Types.ObjectId(),
  contactId: new Types.ObjectId(),
  channelId: new Types.ObjectId(),
  status: 'open',
  controlMode: 'bot',
  lastMessageAt: new Date('2026-05-19T10:00:00.000Z'),
  createdAt: new Date('2026-05-18T00:00:00.000Z'),
  updatedAt: new Date('2026-05-19T10:00:00.000Z'),
  ...overrides,
});

const buildMessageRow = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  _id: new Types.ObjectId(),
  conversationId: new Types.ObjectId(),
  content: 'hello',
  type: 'user',
  contactId: new Types.ObjectId(),
  createdAt: new Date('2026-05-19T10:00:00.000Z'),
  ...overrides,
});

describe('InboxService', () => {
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let service: InboxService;

  beforeEach(() => {
    conversationRepository = {
      findInboxPage: jest.fn(),
      findByIdForClient: jest.fn(),
      updateControlMode: jest.fn(),
    } as unknown as jest.Mocked<ConversationRepository>;

    messageRepository = {
      findByConversationPage: jest.fn(),
    } as unknown as jest.Mocked<MessageRepository>;

    service = new InboxService(conversationRepository, messageRepository);
  });

  describe('listConversations', () => {
    it('returns mapped DTOs with null cursor when fewer than limit items', async () => {
      const clientId = new Types.ObjectId();
      const row = buildConversationRow({ clientId });
      conversationRepository.findInboxPage.mockResolvedValue({
        items: [row as Conversation],
        nextCursor: null,
      });

      const result = await service.listConversations(
        clientId.toHexString(),
        {},
      );

      expect(conversationRepository.findInboxPage).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        { status: 'open', cursor: null, limit: 20 },
      );
      expect(result.nextCursor).toBeNull();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]._id).toBe(row._id.toHexString());
      expect(result.items[0].controlMode).toBe('bot');
    });

    it('encodes next cursor when repository returns one', async () => {
      const row = buildConversationRow();
      conversationRepository.findInboxPage.mockResolvedValue({
        items: [row as Conversation],
        nextCursor: { t: row.lastMessageAt, i: row._id },
      });

      const clientId = new Types.ObjectId().toHexString();
      const result = await service.listConversations(clientId, {});

      expect(result.nextCursor).toEqual(expect.any(String));
      expect(
        typeof result.nextCursor === 'string' && result.nextCursor.length,
      ).toBeGreaterThan(0);
    });

    it('clamps requested limit to MAX_LIMIT (100)', async () => {
      conversationRepository.findInboxPage.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const clientId = new Types.ObjectId().toHexString();
      await service.listConversations(clientId, { limit: 500 });

      expect(conversationRepository.findInboxPage).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('coerces missing controlMode to "bot" (backfill-race safety)', async () => {
      const row = buildConversationRow({ controlMode: undefined });
      conversationRepository.findInboxPage.mockResolvedValue({
        items: [row as Conversation],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
      );
      expect(result.items[0].controlMode).toBe('bot');
    });

    it('passes through explicit status filter', async () => {
      conversationRepository.findInboxPage.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listConversations(new Types.ObjectId().toHexString(), {
        status: 'closed',
      });
      expect(conversationRepository.findInboxPage).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ status: 'closed' }),
      );
    });
  });

  describe('listConversationMessages', () => {
    it('throws NotFoundException when conversation is not owned by client', async () => {
      conversationRepository.findByIdForClient.mockResolvedValue(null);

      await expect(
        service.listConversationMessages(
          new Types.ObjectId().toHexString(),
          new Types.ObjectId().toHexString(),
          {},
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns mapped messages and a conversationId echo when owned', async () => {
      const conv = buildConversationRow();
      conversationRepository.findByIdForClient.mockResolvedValue(
        conv as Conversation,
      );
      const agentId = new Types.ObjectId();
      const msg = buildMessageRow({
        conversationId: conv._id,
        type: 'agent',
        agentId,
        contactId: undefined,
      });
      messageRepository.findByConversationPage.mockResolvedValue({
        items: [msg as Message],
        nextCursor: null,
      });

      const result = await service.listConversationMessages(
        conv.clientId.toHexString(),
        conv._id.toHexString(),
        {},
      );

      expect(result.conversationId).toBe(conv._id.toHexString());
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('agent');
      expect(result.items[0].contactId).toBeNull();
      expect(result.items[0].agentId).toBe(agentId.toHexString());
    });
  });

  describe('updateControlMode', () => {
    it('throws NotFoundException when conversation is not owned', async () => {
      conversationRepository.updateControlMode.mockResolvedValue(null);

      await expect(
        service.updateControlMode(
          new Types.ObjectId().toHexString(),
          new Types.ObjectId().toHexString(),
          'human',
          new Types.ObjectId().toHexString(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns minimal response and forwards the value to the repo', async () => {
      const conv = buildConversationRow({ controlMode: 'human' });
      conversationRepository.updateControlMode.mockResolvedValue(
        conv as Conversation,
      );

      const result = await service.updateControlMode(
        conv.clientId.toHexString(),
        conv._id.toHexString(),
        'human',
        new Types.ObjectId().toHexString(),
      );

      expect(conversationRepository.updateControlMode).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
        'human',
      );
      expect(result.conversationId).toBe(conv._id.toHexString());
      expect(result.controlMode).toBe('human');
    });
  });
});
