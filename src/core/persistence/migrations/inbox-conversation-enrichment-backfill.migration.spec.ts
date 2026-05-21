import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { InboxConversationEnrichmentBackfillMigration } from './inbox-conversation-enrichment-backfill.migration';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';
import { Contact } from '@persistence/schemas/contact.schema';
import { Conversation } from '@persistence/schemas/conversation.schema';
import { Message } from '@persistence/schemas/message.schema';

interface ConversationDoc {
  _id: Types.ObjectId;
  clientId: Types.ObjectId;
  channelId: Types.ObjectId;
  contactId: Types.ObjectId;
}

const buildConversationModel = (
  chunks: ConversationDoc[][],
): { find: jest.Mock; updateOne: jest.Mock; updates: any[] } => {
  const updates: any[] = [];
  const find = jest.fn().mockImplementation(() => {
    const docs = chunks.shift() ?? [];
    return {
      limit: () => ({
        lean: () => ({ exec: jest.fn().mockResolvedValue(docs) }),
      }),
    };
  });
  const updateOne = jest.fn().mockImplementation((filter, update) => {
    updates.push({ filter, update });
    return { exec: jest.fn().mockResolvedValue({ matchedCount: 1 }) };
  });
  return { find, updateOne, updates };
};

const buildContactModel = (
  contactsByConv: Map<string, { _id: Types.ObjectId; name?: string }>,
): { find: jest.Mock } => ({
  find: jest.fn().mockImplementation((query) => {
    const ids: Types.ObjectId[] = query._id.$in;
    const rows = ids
      .map((id) => contactsByConv.get(String(id)))
      .filter((c): c is { _id: Types.ObjectId; name?: string } => !!c);
    return {
      lean: () => ({ exec: jest.fn().mockResolvedValue(rows) }),
    };
  }),
});

const buildMessageModel = (
  latestByConv: Map<string, { content?: string }>,
): { aggregate: jest.Mock } => ({
  aggregate: jest.fn().mockImplementation((pipeline) => {
    const matchStage = pipeline[0].$match;
    const ids: Types.ObjectId[] = matchStage.conversationId.$in;
    const rows = ids
      .map((id) => {
        const latest = latestByConv.get(String(id));
        return latest ? { _id: id, latest } : null;
      })
      .filter((r): r is { _id: Types.ObjectId; latest: any } => !!r);
    return { exec: jest.fn().mockResolvedValue(rows) };
  }),
});

const buildClientAgentModel = (
  matches: Map<string, Array<{ _id: Types.ObjectId }>>,
): { find: jest.Mock } => ({
  find: jest.fn().mockImplementation((query) => {
    const key = `${query.clientId}|${String(
      query.channels.$elemMatch.channelId,
    )}`;
    const rows = matches.get(key) ?? [];
    return {
      lean: () => ({ exec: jest.fn().mockResolvedValue(rows) }),
    };
  }),
});

const setup = async (
  conversationModel: any,
  contactModel: any,
  messageModel: any,
  clientAgentModel: any,
): Promise<InboxConversationEnrichmentBackfillMigration> => {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      InboxConversationEnrichmentBackfillMigration,
      {
        provide: getModelToken(Conversation.name),
        useValue: conversationModel,
      },
      { provide: getModelToken(Contact.name), useValue: contactModel },
      { provide: getModelToken(Message.name), useValue: messageModel },
      { provide: getModelToken(ClientAgent.name), useValue: clientAgentModel },
    ],
  }).compile();
  return moduleRef.get(InboxConversationEnrichmentBackfillMigration);
};

describe('InboxConversationEnrichmentBackfillMigration', () => {
  it('is a no-op when no documents are missing contactNameLower', async () => {
    const conversationModel = buildConversationModel([[]]);
    const contactModel = buildContactModel(new Map());
    const messageModel = buildMessageModel(new Map());
    const clientAgentModel = buildClientAgentModel(new Map());

    const migration = await setup(
      conversationModel,
      contactModel,
      messageModel,
      clientAgentModel,
    );
    await migration.onApplicationBootstrap();

    expect(conversationModel.updateOne).not.toHaveBeenCalled();
  });

  it('enriches a unique-match row with clientAgentId/contactNameLower/preview', async () => {
    const conv: ConversationDoc = {
      _id: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      contactId: new Types.ObjectId(),
    };
    const clientAgentId = new Types.ObjectId();

    const conversationModel = buildConversationModel([[conv], []]);
    const contactModel = buildContactModel(
      new Map([
        [String(conv.contactId), { _id: conv.contactId, name: '  Jane ' }],
      ]),
    );
    const messageModel = buildMessageModel(
      new Map([[String(conv._id), { content: 'Hello there' }]]),
    );
    const clientAgentModel = buildClientAgentModel(
      new Map([
        [
          `${String(conv.clientId)}|${String(conv.channelId)}`,
          [{ _id: clientAgentId }],
        ],
      ]),
    );

    const migration = await setup(
      conversationModel,
      contactModel,
      messageModel,
      clientAgentModel,
    );
    await migration.onApplicationBootstrap();

    expect(conversationModel.updates).toHaveLength(1);
    const $set = conversationModel.updates[0].update.$set;
    expect($set.contactNameLower).toBe('jane');
    expect($set.lastMessagePreview).toBe('Hello there');
    expect(String($set.clientAgentId)).toBe(String(clientAgentId));
  });

  it('leaves clientAgentId unset and logs missing when no ClientAgent matches', async () => {
    const conv: ConversationDoc = {
      _id: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      contactId: new Types.ObjectId(),
    };
    const conversationModel = buildConversationModel([[conv], []]);
    const contactModel = buildContactModel(
      new Map([[String(conv.contactId), { _id: conv.contactId, name: 'X' }]]),
    );
    const messageModel = buildMessageModel(new Map());
    const clientAgentModel = buildClientAgentModel(new Map());

    const migration = await setup(
      conversationModel,
      contactModel,
      messageModel,
      clientAgentModel,
    );

    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await migration.onApplicationBootstrap();

    const $set = conversationModel.updates[0].update.$set;
    expect($set.clientAgentId).toBeUndefined();
    expect($set.contactNameLower).toBe('x');
    expect($set.lastMessagePreview).toBe('');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `event=inbox.backfill.missing conversationId=${String(conv._id)}`,
      ),
    );
    logSpy.mockRestore();
  });

  it('logs ambiguous WARN and leaves clientAgentId unset on multi-match', async () => {
    const conv: ConversationDoc = {
      _id: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      contactId: new Types.ObjectId(),
    };
    const conversationModel = buildConversationModel([[conv], []]);
    const contactModel = buildContactModel(
      new Map([[String(conv.contactId), { _id: conv.contactId, name: 'X' }]]),
    );
    const messageModel = buildMessageModel(new Map());
    const clientAgentModel = buildClientAgentModel(
      new Map([
        [
          `${String(conv.clientId)}|${String(conv.channelId)}`,
          [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }],
        ],
      ]),
    );

    const migration = await setup(
      conversationModel,
      contactModel,
      messageModel,
      clientAgentModel,
    );

    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await migration.onApplicationBootstrap();

    const $set = conversationModel.updates[0].update.$set;
    expect($set.clientAgentId).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `event=inbox.backfill.ambiguous conversationId=${String(conv._id)}`,
      ),
    );
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('candidateCount=2')),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it('emits aggregate summary log when any rows were processed', async () => {
    const conv: ConversationDoc = {
      _id: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      contactId: new Types.ObjectId(),
    };
    const conversationModel = buildConversationModel([[conv], []]);
    const contactModel = buildContactModel(
      new Map([[String(conv.contactId), { _id: conv.contactId, name: 'A' }]]),
    );
    const messageModel = buildMessageModel(new Map());
    const clientAgentModel = buildClientAgentModel(
      new Map([
        [
          `${String(conv.clientId)}|${String(conv.channelId)}`,
          [{ _id: new Types.ObjectId() }],
        ],
      ]),
    );

    const migration = await setup(
      conversationModel,
      contactModel,
      messageModel,
      clientAgentModel,
    );
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await migration.onApplicationBootstrap();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'event=inbox.backfill.summary total=1 enriched=1 ambiguous=0 missing=0',
      ),
    );
    logSpy.mockRestore();
  });

  it('rethrows on error so startup fails fast', async () => {
    const conversationModel = buildConversationModel([[]]);
    conversationModel.find.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const contactModel = buildContactModel(new Map());
    const messageModel = buildMessageModel(new Map());
    const clientAgentModel = buildClientAgentModel(new Map());

    const migration = await setup(
      conversationModel,
      contactModel,
      messageModel,
      clientAgentModel,
    );
    await expect(migration.onApplicationBootstrap()).rejects.toThrow('boom');
  });
});
