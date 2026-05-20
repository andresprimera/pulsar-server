import { Types } from 'mongoose';
import { ConversationRepository } from './conversation.repository';

interface ChainMock {
  filter?: Record<string, unknown>;
  hint?: string;
  rows: any[];
}

function buildConversationModel(chain: ChainMock): { find: jest.Mock } {
  const sort = jest.fn().mockReturnThis();
  const limit = jest.fn().mockReturnThis();
  const hint = jest.fn().mockImplementation(function (this: any, name: string) {
    chain.hint = name;
    return this;
  });
  const lean = jest.fn().mockReturnThis();
  const exec = jest.fn().mockResolvedValue(chain.rows);

  const find = jest
    .fn()
    .mockImplementation(function (filter: Record<string, unknown>) {
      chain.filter = filter;
      return { sort, limit, hint, lean, exec };
    });

  return { find };
}

function buildLookupModel(rows: any[]): { find: jest.Mock } {
  return {
    find: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function buildRepo(
  conversationModel: any,
  contactModel: any,
  channelModel: any,
  clientAgentModel: any,
  agentModel: any,
): ConversationRepository {
  return new ConversationRepository(
    conversationModel,
    contactModel,
    channelModel,
    clientAgentModel,
    agentModel,
  );
}

describe('ConversationRepository.findInboxPageEnriched', () => {
  const clientId = new Types.ObjectId();

  it('filters by (clientId, status) and pins inbox_list_idx by default', async () => {
    const chain: ChainMock = { rows: [] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
    });

    expect(chain.filter).toEqual({ clientId, status: 'open' });
    expect(chain.hint).toBe('inbox_list_idx');
  });

  it('composes channelId into the filter', async () => {
    const chain: ChainMock = { rows: [] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const channelId = new Types.ObjectId();
    await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      channelId,
    });

    expect(chain.filter).toMatchObject({ channelId });
  });

  it('pins inbox_list_agent_idx when clientAgentId is supplied', async () => {
    const chain: ChainMock = { rows: [] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const clientAgentId = new Types.ObjectId();
    await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      clientAgentId,
    });

    expect(chain.filter).toMatchObject({ clientAgentId });
    expect(chain.hint).toBe('inbox_list_agent_idx');
  });

  it('applies qLowered as an unanchored regex against contactNameLower', async () => {
    const chain: ChainMock = { rows: [] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      qLowered: 'jane',
    });

    expect(chain.filter).toMatchObject({
      contactNameLower: { $regex: 'jane' },
    });
  });

  it('composes the cursor predicate alongside all filters', async () => {
    const chain: ChainMock = { rows: [] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const cursorTs = new Date('2026-04-01T00:00:00Z');
    const cursorId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const clientAgentId = new Types.ObjectId();
    await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: { t: cursorTs, i: cursorId },
      limit: 20,
      channelId,
      clientAgentId,
      qLowered: 'foo',
    });

    expect(chain.filter).toMatchObject({
      clientId,
      status: 'open',
      channelId,
      clientAgentId,
      contactNameLower: { $regex: 'foo' },
      $or: [
        { lastMessageAt: { $lt: cursorTs } },
        { lastMessageAt: cursorTs, _id: { $lt: cursorId } },
      ],
    });
  });

  it('builds joined rows from batched lookups', async () => {
    const convId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const clientAgentId = new Types.ObjectId();
    const agentObjId = new Types.ObjectId();
    const agentId = String(agentObjId);

    const baseRow = {
      _id: convId,
      clientId,
      contactId,
      channelId,
      clientAgentId,
      status: 'open',
      controlMode: 'bot',
      lastMessageAt: new Date(),
      lastMessagePreview: 'hi there',
      summary: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);

    const contactModel = buildLookupModel([
      {
        _id: contactId,
        name: 'Jane',
        identifier: { type: 'email', value: 'j@x.com' },
      },
    ]);
    const channelModel = buildLookupModel([
      { _id: channelId, type: 'whatsapp' },
    ]);
    const clientAgentModel = buildLookupModel([
      {
        _id: clientAgentId,
        agentId,
        channels: [{ channelId, phoneNumberId: '+12025550100' }],
      },
    ]);
    const agentModel = buildLookupModel([{ _id: agentObjId, name: 'Agent A' }]);

    const repo = buildRepo(
      conversationModel,
      contactModel,
      channelModel,
      clientAgentModel,
      agentModel,
    );

    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
    });

    expect(page.items).toHaveLength(1);
    const row = page.items[0];
    expect(row.contact?.name).toBe('Jane');
    expect(row.channel?.type).toBe('whatsapp');
    expect(row.clientAgent?.agentId).toBe(agentId);
    expect(row.agent?.name).toBe('Agent A');
    expect(row.lastMessagePreview).toBe('hi there');
  });

  it('keeps unset lastMessagePreview as undefined on the joined row', async () => {
    const convId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const baseRow = {
      _id: convId,
      clientId,
      contactId,
      channelId,
      status: 'open',
      controlMode: 'bot',
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([{ _id: contactId, name: 'C' }]),
      buildLookupModel([{ _id: channelId, type: 'whatsapp' }]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
    });

    expect(page.items[0].lastMessagePreview).toBeUndefined();
  });

  it('returns nextCursor when more than limit rows are read', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      _id: new Types.ObjectId(),
      clientId,
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      controlMode: 'bot',
      lastMessageAt: new Date(Date.now() - i * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const chain: ChainMock = { rows };
    const conversationModel = buildConversationModel(chain);
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toEqual({
      t: rows[1].lastMessageAt,
      i: rows[1]._id,
    });
  });
});

describe('ConversationRepository.updateLastMessageAt', () => {
  it('writes lastMessagePreview when supplied (server-truncated to 280)', async () => {
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    const conversationModel: any = { findByIdAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const id = new Types.ObjectId();
    const ts = new Date();
    const longPreview = 'x'.repeat(500);
    await repo.updateLastMessageAt(id, ts, longPreview);

    const call = findByIdAndUpdate.mock.calls[0];
    expect(call[0]).toBe(id);
    expect((call[1] as any).lastMessageAt).toBe(ts);
    expect((call[1] as any).lastMessagePreview).toHaveLength(280);
  });

  it('omits lastMessagePreview when not supplied (byte-identical to before)', async () => {
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    const conversationModel: any = { findByIdAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const id = new Types.ObjectId();
    const ts = new Date();
    await repo.updateLastMessageAt(id, ts);

    const update = findByIdAndUpdate.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(update).toEqual({ lastMessageAt: ts });
  });
});

describe('ConversationRepository.setEnrichmentFields', () => {
  it('applies only supplied fields via $set', async () => {
    const updateOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(undefined),
    });
    const conversationModel: any = { updateOne };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const id = new Types.ObjectId();
    const clientAgentId = new Types.ObjectId();
    await repo.setEnrichmentFields(id, {
      clientAgentId,
      contactNameLower: 'jane',
    });

    const call = updateOne.mock.calls[0];
    expect(call[0]).toEqual({ _id: id });
    expect(call[1]).toEqual({
      $set: { clientAgentId, contactNameLower: 'jane' },
    });
  });

  it('truncates lastMessagePreview to 280 chars in the $set', async () => {
    const updateOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(undefined),
    });
    const conversationModel: any = { updateOne };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const id = new Types.ObjectId();
    await repo.setEnrichmentFields(id, {
      lastMessagePreview: 'x'.repeat(1000),
    });

    const $set = (updateOne.mock.calls[0][1] as any).$set;
    expect($set.lastMessagePreview).toHaveLength(280);
  });

  it('is a no-op when no fields are supplied', async () => {
    const updateOne = jest.fn();
    const conversationModel: any = { updateOne };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    await repo.setEnrichmentFields(new Types.ObjectId(), {});

    expect(updateOne).not.toHaveBeenCalled();
  });
});
