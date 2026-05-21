import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InboxService } from './inbox.service';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import {
  ConversationRepository,
  EnrichedInboxRow,
} from '@persistence/repositories/conversation.repository';
import { MessageRepository } from '@persistence/repositories/message.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { Conversation } from '@persistence/schemas/conversation.schema';
import { Message } from '@persistence/schemas/message.schema';

type EnrichedInboxRowOverrides = Partial<EnrichedInboxRow>;

type MessageRow = Partial<Message> & {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  content: string;
  type: 'user' | 'agent' | 'summary';
  contactId?: Types.ObjectId;
  agentId?: Types.ObjectId;
  createdAt?: Date;
};

const buildEnrichedRow = (
  overrides: EnrichedInboxRowOverrides = {},
): EnrichedInboxRow => ({
  _id: new Types.ObjectId(),
  clientId: new Types.ObjectId(),
  contactId: new Types.ObjectId(),
  channelId: new Types.ObjectId(),
  clientAgentId: undefined,
  status: 'open',
  controlMode: 'bot',
  lastMessageAt: new Date('2026-05-19T10:00:00.000Z'),
  lastMessagePreview: 'hello',
  summary: undefined,
  createdAt: new Date('2026-05-18T00:00:00.000Z'),
  updatedAt: new Date('2026-05-19T10:00:00.000Z'),
  contact: { name: 'Jane Doe', identifier: { type: 'phone', value: '+1' } },
  channel: { type: 'whatsapp' },
  clientAgent: null,
  agent: null,
  assignedOperator: null,
  tags: [],
  unread: false,
  ...overrides,
});

const ACTOR = new Types.ObjectId().toHexString();

const buildMessageRow = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  _id: new Types.ObjectId(),
  conversationId: new Types.ObjectId(),
  content: 'hello',
  type: 'user',
  contactId: new Types.ObjectId(),
  createdAt: new Date('2026-05-19T10:00:00.000Z'),
  ...overrides,
});

const buildConversationDoc = (
  overrides: Partial<Conversation> = {},
): Partial<Conversation> => ({
  _id: new Types.ObjectId(),
  clientId: new Types.ObjectId(),
  contactId: new Types.ObjectId(),
  channelId: new Types.ObjectId(),
  status: 'open',
  controlMode: 'bot',
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('InboxService', () => {
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let clientAgentRepository: jest.Mocked<ClientAgentRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let service: InboxService;

  beforeEach(() => {
    conversationRepository = {
      findInboxPageEnriched: jest.fn(),
      findByIdForClient: jest.fn(),
      updateControlMode: jest.fn(),
    } as unknown as jest.Mocked<ConversationRepository>;

    messageRepository = {
      findByConversationPage: jest.fn(),
    } as unknown as jest.Mocked<MessageRepository>;

    clientAgentRepository = {
      findByClientAndAgent: jest.fn(),
    } as unknown as jest.Mocked<ClientAgentRepository>;

    userRepository = {
      findByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserRepository>;

    service = new InboxService(
      conversationRepository,
      messageRepository,
      clientAgentRepository,
      userRepository,
    );
  });

  describe('listConversations', () => {
    it('returns mapped DTOs with null cursor when fewer than limit items', async () => {
      const clientId = new Types.ObjectId();
      const row = buildEnrichedRow({ clientId });
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [row],
        nextCursor: null,
      });

      const result = await service.listConversations(
        clientId.toHexString(),
        {},
        ACTOR,
      );

      expect(conversationRepository.findInboxPageEnriched).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        {
          status: 'open',
          cursor: null,
          limit: 20,
          channelId: undefined,
          clientAgentId: undefined,
          qLowered: undefined,
          actorClientUserId: expect.any(Types.ObjectId),
        },
      );
      expect(result.nextCursor).toBeNull();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]._id).toBe(row._id.toHexString());
      expect(result.items[0].controlMode).toBe('bot');
    });

    it('encodes next cursor when repository returns one', async () => {
      const row = buildEnrichedRow();
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [row],
        nextCursor: { t: row.lastMessageAt, i: row._id },
      });

      const clientId = new Types.ObjectId().toHexString();
      const result = await service.listConversations(clientId, {}, ACTOR);

      expect(result.nextCursor).toEqual(expect.any(String));
      expect(
        typeof result.nextCursor === 'string' && result.nextCursor.length,
      ).toBeGreaterThan(0);
    });

    it('clamps requested limit to MAX_LIMIT (100)', async () => {
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const clientId = new Types.ObjectId().toHexString();
      await service.listConversations(clientId, { limit: 500 }, ACTOR);

      expect(conversationRepository.findInboxPageEnriched).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('coerces missing controlMode to "bot" (backfill-race safety)', async () => {
      const row = buildEnrichedRow({ controlMode: undefined });
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [row],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        ACTOR,
      );
      expect(result.items[0].controlMode).toBe('bot');
    });

    it('passes through explicit status filter', async () => {
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listConversations(
        new Types.ObjectId().toHexString(),
        { status: 'closed' },
        ACTOR,
      );
      expect(conversationRepository.findInboxPageEnriched).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ status: 'closed' }),
      );
    });

    it('forwards channelId as ObjectId', async () => {
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const channelId = new Types.ObjectId().toHexString();
      await service.listConversations(
        new Types.ObjectId().toHexString(),
        { channelId },
        ACTOR,
      );

      const call = conversationRepository.findInboxPageEnriched.mock.calls[0];
      expect(call[1].channelId).toBeInstanceOf(Types.ObjectId);
      expect(String(call[1].channelId)).toBe(channelId);
    });

    it('resolves agentId to clientAgentId via the client-agent repository', async () => {
      const clientId = new Types.ObjectId();
      const agentId = new Types.ObjectId();
      const clientAgentId = new Types.ObjectId();
      clientAgentRepository.findByClientAndAgent.mockResolvedValue({
        _id: clientAgentId,
      } as any);
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listConversations(
        clientId.toHexString(),
        { agentId: agentId.toHexString() },
        ACTOR,
      );

      expect(clientAgentRepository.findByClientAndAgent).toHaveBeenCalledWith(
        clientId.toHexString(),
        agentId.toHexString(),
      );
      const call = conversationRepository.findInboxPageEnriched.mock.calls[0];
      expect(String(call[1].clientAgentId)).toBe(String(clientAgentId));
    });

    it('returns an empty page when agentId resolves to no hire', async () => {
      clientAgentRepository.findByClientAndAgent.mockResolvedValue(null);

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        { agentId: new Types.ObjectId().toHexString() },
        ACTOR,
      );

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(
        conversationRepository.findInboxPageEnriched,
      ).not.toHaveBeenCalled();
    });

    it('trims, lowercases, and regex-escapes the q filter before forwarding', async () => {
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      await service.listConversations(
        new Types.ObjectId().toHexString(),
        { q: '  Foo.Bar*+  ' },
        ACTOR,
      );

      const call = conversationRepository.findInboxPageEnriched.mock.calls[0];
      // class-validator's @Transform runs in the controller pipe in real use;
      // the service additionally trims as defense-in-depth.
      expect(call[1].qLowered).toBe('foo\\.bar\\*\\+');
    });

    it('maps real values for assignedOperatorName / unreadCount / tags (Phase 3)', async () => {
      const assignedRow = buildEnrichedRow({
        assignedOperator: { name: 'Ana' },
        tags: ['vip'],
        unread: true,
      });
      const unassignedRow = buildEnrichedRow({
        assignedOperator: null,
        tags: [],
        unread: false,
      });
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [assignedRow, unassignedRow],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        ACTOR,
      );

      expect(result.items[0].assignedOperatorName).toBe('Ana');
      expect(result.items[0].unreadCount).toBe(1);
      expect(result.items[0].tags).toEqual(['vip']);

      expect(result.items[1].assignedOperatorName).toBeNull();
      expect(result.items[1].unreadCount).toBe(0);
      expect(result.items[1].tags).toEqual([]);
    });

    it('forwards actorClientUserId to the repository as a Types.ObjectId', async () => {
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const actorHex = new Types.ObjectId().toHexString();
      await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        actorHex,
      );

      const call = conversationRepository.findInboxPageEnriched.mock.calls[0];
      expect(call[1].actorClientUserId).toBeInstanceOf(Types.ObjectId);
      expect(String(call[1].actorClientUserId)).toBe(actorHex);
    });

    it('projects contactEmail from email identifier and null otherwise', async () => {
      const emailRow = buildEnrichedRow({
        contact: { name: 'A', identifier: { type: 'email', value: 'a@b.c' } },
      });
      const phoneRow = buildEnrichedRow({
        contact: { name: 'B', identifier: { type: 'phone', value: '+1' } },
      });
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [emailRow, phoneRow],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        ACTOR,
      );

      expect(result.items[0].contactEmail).toBe('a@b.c');
      expect(result.items[1].contactEmail).toBeNull();
    });

    it('lowercases provider', async () => {
      const row = buildEnrichedRow({ channel: { type: 'WhatsApp' } });
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [row],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        ACTOR,
      );

      expect(result.items[0].provider).toBe('whatsapp');
    });

    it('resolves channelHandle by precedence (phone → instagram → tiktok → telegram)', async () => {
      const channelId = new Types.ObjectId();

      const phoneRow = buildEnrichedRow({
        channelId,
        clientAgent: {
          agentId: 'a',
          channels: [
            {
              channelId,
              phoneNumberId: '+1',
              instagramAccountId: 'ig',
              tiktokUserId: 'tt',
              telegramBotId: 'tg',
            },
          ],
        },
      });
      const igRow = buildEnrichedRow({
        channelId,
        clientAgent: {
          agentId: 'a',
          channels: [
            {
              channelId,
              instagramAccountId: 'ig',
              tiktokUserId: 'tt',
              telegramBotId: 'tg',
            },
          ],
        },
      });
      const tgRow = buildEnrichedRow({
        channelId,
        clientAgent: {
          agentId: 'a',
          channels: [{ channelId, telegramBotId: 'tg' }],
        },
      });
      const missingRow = buildEnrichedRow({
        channelId,
        clientAgent: null,
      });

      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [phoneRow, igRow, tgRow, missingRow],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        ACTOR,
      );

      expect(result.items[0].channelHandle).toBe('+1');
      expect(result.items[1].channelHandle).toBe('ig');
      expect(result.items[2].channelHandle).toBe('tg');
      expect(result.items[3].channelHandle).toBe('');
    });

    it('defaults lastMessagePreview to "" when unset', async () => {
      const row = buildEnrichedRow({ lastMessagePreview: undefined });
      conversationRepository.findInboxPageEnriched.mockResolvedValue({
        items: [row],
        nextCursor: null,
      });

      const result = await service.listConversations(
        new Types.ObjectId().toHexString(),
        {},
        ACTOR,
      );
      expect(result.items[0].lastMessagePreview).toBe('');
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
      const conv = buildConversationDoc();
      conversationRepository.findByIdForClient.mockResolvedValue(
        conv as Conversation,
      );
      const agentId = new Types.ObjectId();
      const msg = buildMessageRow({
        conversationId: conv._id as Types.ObjectId,
        type: 'agent',
        agentId,
        contactId: undefined,
      });
      messageRepository.findByConversationPage.mockResolvedValue({
        items: [msg as Message],
        nextCursor: null,
      });

      const result = await service.listConversationMessages(
        (conv.clientId as Types.ObjectId).toHexString(),
        (conv._id as Types.ObjectId).toHexString(),
        {},
      );

      expect(result.conversationId).toBe(
        (conv._id as Types.ObjectId).toHexString(),
      );
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
      const conv = buildConversationDoc({ controlMode: 'human' });
      conversationRepository.updateControlMode.mockResolvedValue(
        conv as Conversation,
      );

      const result = await service.updateControlMode(
        (conv.clientId as Types.ObjectId).toHexString(),
        (conv._id as Types.ObjectId).toHexString(),
        'human',
        new Types.ObjectId().toHexString(),
      );

      expect(conversationRepository.updateControlMode).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.any(Types.ObjectId),
        'human',
      );
      expect(result.conversationId).toBe(
        (conv._id as Types.ObjectId).toHexString(),
      );
      expect(result.controlMode).toBe('human');
    });
  });
});
