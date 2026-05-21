import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ConversationService } from './conversation.service';
// eslint-disable-next-line boundaries/element-types -- TODO: domain→persistence violation, tracked for refactor
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import {
  INBOX_CONVERSATION_WRITE_PORT,
  InboxConversationWritePort,
} from '@shared/ports/inbox-conversation-write.port';
import { WHATSAPP_CONVERSATION_TIMEOUT_MS } from './conversation.constants';

describe('ConversationService', () => {
  let service: ConversationService;
  let repository: jest.Mocked<ConversationRepository>;
  let inboxWritePort: jest.Mocked<InboxConversationWritePort>;

  const now = new Date('2026-02-28T10:00:00.000Z');
  const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const contactId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const channelId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const existingConversationId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const newConversationId = new Types.ObjectId('507f1f77bcf86cd799439015');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: ConversationRepository,
          useValue: {
            create: jest.fn(),
            findLatestOpenByClientContactAndChannel: jest.fn(),
            updateStatus: jest.fn(),
            updateLastMessageAt: jest.fn(),
          },
        },
        {
          provide: INBOX_CONVERSATION_WRITE_PORT,
          useValue: {
            updateLastMessageAt: jest.fn(),
            setEnrichmentFields: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ConversationService);
    repository = module.get(ConversationRepository);
    inboxWritePort = module.get(INBOX_CONVERSATION_WRITE_PORT);
  });

  it('reuses the open conversation when elapsed time is under 24h', async () => {
    const existing = {
      _id: existingConversationId,
      status: 'open',
      lastMessageAt: new Date(
        now.getTime() - WHATSAPP_CONVERSATION_TIMEOUT_MS + 1000,
      ),
    };

    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue(
      existing as any,
    );

    const result = await service.resolveOrCreate({
      clientId,
      contactId,
      channelId,
      now,
    });

    expect(result).toBe(existing);
    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates a new conversation when elapsed time is >= 24h', async () => {
    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue({
      _id: existingConversationId,
      status: 'open',
      lastMessageAt: new Date(now.getTime() - WHATSAPP_CONVERSATION_TIMEOUT_MS),
    } as any);

    repository.create.mockResolvedValue({
      _id: newConversationId,
      status: 'open',
      lastMessageAt: now,
    } as any);

    const result = await service.resolveOrCreate({
      clientId,
      contactId,
      channelId,
      now,
    });

    expect(repository.updateStatus).toHaveBeenCalledWith(
      existingConversationId,
      'closed',
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        contactId,
        channelId,
        status: 'open',
        lastMessageAt: now,
      }),
    );
    expect(result._id.toString()).toBe(newConversationId.toString());
  });

  it('creates a new open conversation when no open conversation exists', async () => {
    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      _id: newConversationId,
      status: 'open',
      lastMessageAt: now,
    } as any);

    const result = await service.resolveOrCreate({
      clientId,
      contactId,
      channelId,
      now,
    });

    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        contactId,
        channelId,
        status: 'open',
        lastMessageAt: now,
      }),
    );
    expect(result._id.toString()).toBe(newConversationId.toString());
  });

  it('never reuses closed conversations', async () => {
    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      _id: newConversationId,
      status: 'open',
      lastMessageAt: now,
    } as any);

    const result = await service.resolveOrCreate({
      clientId,
      contactId,
      channelId,
      now,
    });

    expect(
      repository.findLatestOpenByClientContactAndChannel,
    ).toHaveBeenCalledWith({
      clientId,
      contactId,
      channelId,
    });
    expect(result._id.toString()).toBe(newConversationId.toString());
    expect((result as any).status).toBe('open');
  });

  it('does not reuse a closed conversation even when it is within timeout', async () => {
    repository.findLatestOpenByClientContactAndChannel.mockResolvedValue({
      _id: existingConversationId,
      status: 'closed',
      lastMessageAt: new Date(now.getTime() - 1000),
    } as any);

    repository.create.mockResolvedValue({
      _id: newConversationId,
      status: 'open',
      lastMessageAt: now,
    } as any);

    const result = await service.resolveOrCreate({
      clientId,
      contactId,
      channelId,
      now,
    });

    expect(result._id.toString()).toBe(newConversationId.toString());
    expect((result as any).status).toBe('open');
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('touch routes through the inbox conversation write port', async () => {
    inboxWritePort.updateLastMessageAt.mockResolvedValue(undefined as any);

    await service.touch(existingConversationId, now);

    expect(inboxWritePort.updateLastMessageAt).toHaveBeenCalledWith(
      existingConversationId,
      now,
      undefined,
    );
    expect(repository.updateLastMessageAt).not.toHaveBeenCalled();
  });

  it('touch forwards lastMessagePreview through the port when supplied', async () => {
    inboxWritePort.updateLastMessageAt.mockResolvedValue(undefined as any);

    await service.touch(existingConversationId, now, 'hello world');

    expect(inboxWritePort.updateLastMessageAt).toHaveBeenCalledWith(
      existingConversationId,
      now,
      'hello world',
    );
  });

  it('handles concurrent resolveOrCreate calls safely when duplicate key is raised', async () => {
    const createdConversation = {
      _id: newConversationId,
      status: 'open',
      lastMessageAt: now,
    };

    repository.findLatestOpenByClientContactAndChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdConversation as any);

    repository.create
      .mockResolvedValueOnce(createdConversation as any)
      .mockRejectedValueOnce({ code: 11000 });

    const [resultA, resultB] = await Promise.all([
      service.resolveOrCreate({
        clientId,
        contactId,
        channelId,
        now,
      }),
      service.resolveOrCreate({
        clientId,
        contactId,
        channelId,
        now,
      }),
    ]);

    expect(resultA._id.toString()).toBe(newConversationId.toString());
    expect(resultB._id.toString()).toBe(newConversationId.toString());
    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(
      repository.findLatestOpenByClientContactAndChannel,
    ).toHaveBeenCalledTimes(3);
    expect(resultA._id.toString()).toBe(resultB._id.toString());
  });

  it('handles 10 concurrent resolveOrCreate calls with a single open conversation', async () => {
    const createdConversation = {
      _id: newConversationId,
      status: 'open',
      lastMessageAt: now,
    };

    for (let i = 0; i < 10; i++) {
      repository.findLatestOpenByClientContactAndChannel.mockResolvedValueOnce(
        null,
      );
    }
    for (let i = 0; i < 9; i++) {
      repository.findLatestOpenByClientContactAndChannel.mockResolvedValueOnce(
        createdConversation as any,
      );
    }

    repository.create.mockResolvedValueOnce(createdConversation as any);
    for (let i = 0; i < 9; i++) {
      repository.create.mockRejectedValueOnce({ code: 11000 });
    }

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.resolveOrCreate({
          clientId,
          contactId,
          channelId,
          now,
        }),
      ),
    );

    expect(results).toHaveLength(10);
    for (const result of results) {
      expect(result._id.toString()).toBe(newConversationId.toString());
    }

    expect(repository.create).toHaveBeenCalledTimes(10);
    expect(
      repository.findLatestOpenByClientContactAndChannel,
    ).toHaveBeenCalledTimes(19);
  });
});
