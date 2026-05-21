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
  userModel: any = buildLookupModel([]),
  conversationReadModel: any = buildLookupModel([]),
): ConversationRepository {
  return new ConversationRepository(
    conversationModel,
    contactModel,
    channelModel,
    clientAgentModel,
    agentModel,
    userModel,
    conversationReadModel,
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

describe('ConversationRepository.findInboxPageEnriched — Phase 3 joins', () => {
  const clientId = new Types.ObjectId();

  it('skips assignedOperator + reads joins when actorClientUserId is undefined', async () => {
    const convId = new Types.ObjectId();
    const baseRow = {
      _id: convId,
      clientId,
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedOperatorId: new Types.ObjectId(),
      tags: ['vip'],
    };
    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);

    const userModel = buildLookupModel([
      { _id: baseRow.assignedOperatorId, name: 'Ana' },
    ]);
    const readModel = buildLookupModel([
      { conversationId: convId, lastReadAt: new Date() },
    ]);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      userModel,
      readModel,
    );

    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
    });

    expect(page.items[0].assignedOperator).toBeNull();
    expect(page.items[0].unread).toBe(false);
    expect(page.items[0].tags).toEqual(['vip']);
    // Neither lookup was invoked because the principal is unknown.
    expect((userModel as { find: jest.Mock }).find).not.toHaveBeenCalled();
    expect((readModel as { find: jest.Mock }).find).not.toHaveBeenCalled();
  });

  it('projects assignedOperator name and unread=false when read record is fresh', async () => {
    const convId = new Types.ObjectId();
    const assignedId = new Types.ObjectId();
    const lastMessageAt = new Date('2026-05-19T10:00:00Z');
    const baseRow = {
      _id: convId,
      clientId,
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      lastMessageAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedOperatorId: assignedId,
      tags: ['urgent'],
    };
    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);
    const userModel = buildLookupModel([{ _id: assignedId, name: 'Ana' }]);
    const readModel = buildLookupModel([
      { conversationId: convId, lastReadAt: new Date('2026-05-20T10:00:00Z') },
    ]);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      userModel,
      readModel,
    );

    const actorClientUserId = new Types.ObjectId();
    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      actorClientUserId,
    });

    expect(page.items[0].assignedOperator).toEqual({
      _id: assignedId,
      name: 'Ana',
    });
    expect(page.items[0].unread).toBe(false);
    expect(page.items[0].tags).toEqual(['urgent']);
  });

  it('marks unread=true when no read record exists for the operator', async () => {
    const convId = new Types.ObjectId();
    const baseRow = {
      _id: convId,
      clientId,
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    };
    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const actorClientUserId = new Types.ObjectId();
    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      actorClientUserId,
    });

    expect(page.items[0].unread).toBe(true);
  });

  it('marks unread=true when read record lastReadAt < lastMessageAt', async () => {
    const convId = new Types.ObjectId();
    const lastMessageAt = new Date('2026-05-20T10:00:00Z');
    const baseRow = {
      _id: convId,
      clientId,
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      lastMessageAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    };
    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);
    const readModel = buildLookupModel([
      { conversationId: convId, lastReadAt: new Date('2026-05-19T10:00:00Z') },
    ]);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      readModel,
    );

    const actorClientUserId = new Types.ObjectId();
    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      actorClientUserId,
    });

    expect(page.items[0].unread).toBe(true);
  });

  it('graceful degradation: assignedOperator=null when join returns nothing', async () => {
    const convId = new Types.ObjectId();
    const assignedId = new Types.ObjectId();
    const baseRow = {
      _id: convId,
      clientId,
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedOperatorId: assignedId,
      tags: [],
    };
    const chain: ChainMock = { rows: [baseRow] };
    const conversationModel = buildConversationModel(chain);

    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      // empty users array — cross-tenant user filtered out at the lookup
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const actorClientUserId = new Types.ObjectId();
    const page = await repo.findInboxPageEnriched(clientId, {
      status: 'open',
      cursor: null,
      limit: 20,
      actorClientUserId,
    });

    expect(page.items[0].assignedOperator).toBeNull();
  });
});

describe('ConversationRepository.updateStatusForClient', () => {
  it('returns updated doc on happy path', async () => {
    const updated = { _id: new Types.ObjectId(), status: 'closed' };
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const conversationId = new Types.ObjectId();
    const clientId = new Types.ObjectId();
    const result = await repo.updateStatusForClient(
      conversationId,
      clientId,
      'closed',
    );

    expect(result).toBe(updated);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: conversationId, clientId },
      { $set: { status: 'closed' } },
      expect.objectContaining({ new: true, runValidators: true }),
    );
  });

  it('returns null for cross-tenant or not-found', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const result = await repo.updateStatusForClient(
      new Types.ObjectId(),
      new Types.ObjectId(),
      'closed',
    );

    expect(result).toBeNull();
  });
});

describe('ConversationRepository.updateAssignmentForClient', () => {
  it('uses $set when assignedOperatorId is non-null', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const operatorId = new Types.ObjectId();
    await repo.updateAssignmentForClient(
      new Types.ObjectId(),
      new Types.ObjectId(),
      operatorId,
    );

    expect(findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { assignedOperatorId: operatorId },
    });
  });

  it('uses $unset when assignedOperatorId is null', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    await repo.updateAssignmentForClient(
      new Types.ObjectId(),
      new Types.ObjectId(),
      null,
    );

    expect(findOneAndUpdate.mock.calls[0][1]).toEqual({
      $unset: { assignedOperatorId: 1 },
    });
  });

  it('returns null for cross-tenant or not-found', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const result = await repo.updateAssignmentForClient(
      new Types.ObjectId(),
      new Types.ObjectId(),
      null,
    );
    expect(result).toBeNull();
  });
});

describe('ConversationRepository.updateTagsForClient', () => {
  it('replaces tags via $set on happy path', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    await repo.updateTagsForClient(new Types.ObjectId(), new Types.ObjectId(), [
      'vip',
      'urgent',
    ]);

    expect(findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { tags: ['vip', 'urgent'] },
    });
  });

  it('returns null for cross-tenant or not-found', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    });
    const conversationModel: any = { findOneAndUpdate };
    const repo = buildRepo(
      conversationModel,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const result = await repo.updateTagsForClient(
      new Types.ObjectId(),
      new Types.ObjectId(),
      [],
    );
    expect(result).toBeNull();
  });
});

describe('ConversationRepository.findOneForInboxEnriched', () => {
  function buildFindOneModel(rows: {
    conversation?: any;
    contact?: any;
    channel?: any;
    clientAgent?: any;
    agent?: any;
    user?: any;
    read?: any;
  }) {
    return {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(rows.conversation ?? null),
        }),
      }),
    };
  }

  function buildFindOneLookup(row: any) {
    return {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(row),
        }),
      }),
    };
  }

  it('returns null when conversation is missing or cross-tenant', async () => {
    const conversationModel: any = buildFindOneModel({ conversation: null });

    const repo = new ConversationRepository(
      conversationModel,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
    );

    const result = await repo.findOneForInboxEnriched(
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    );
    expect(result).toBeNull();
  });

  it('returns enriched row on happy path', async () => {
    const convId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const clientId = new Types.ObjectId();
    const clientAgentId = new Types.ObjectId();
    const agentObjId = new Types.ObjectId();
    const agentId = String(agentObjId);
    const assignedId = new Types.ObjectId();
    const lastMessageAt = new Date('2026-05-19T10:00:00Z');

    const conversation = {
      _id: convId,
      clientId,
      contactId,
      channelId,
      clientAgentId,
      status: 'open',
      controlMode: 'human',
      lastMessageAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedOperatorId: assignedId,
      tags: ['vip'],
    };

    const conversationModel: any = buildFindOneModel({ conversation });
    const contactModel: any = buildFindOneLookup({
      _id: contactId,
      name: 'Jane',
    });
    const channelModel: any = buildFindOneLookup({
      _id: channelId,
      type: 'whatsapp',
    });
    const clientAgentModel: any = buildFindOneLookup({
      _id: clientAgentId,
      agentId,
      channels: [],
    });
    const agentModel: any = buildFindOneLookup({
      _id: agentObjId,
      name: 'Agent A',
    });
    const userModel: any = buildFindOneLookup({ _id: assignedId, name: 'Ana' });
    const readModel: any = buildFindOneLookup({
      conversationId: convId,
      lastReadAt: new Date('2026-05-20T10:00:00Z'),
    });

    const repo = new ConversationRepository(
      conversationModel,
      contactModel,
      channelModel,
      clientAgentModel,
      agentModel,
      userModel,
      readModel,
    );

    const result = await repo.findOneForInboxEnriched(
      convId,
      clientId,
      new Types.ObjectId(),
    );

    expect(result).not.toBeNull();
    expect(result?.contact?.name).toBe('Jane');
    expect(result?.channel?.type).toBe('whatsapp');
    expect(result?.assignedOperator?.name).toBe('Ana');
    expect(result?.unread).toBe(false);
    expect(result?.tags).toEqual(['vip']);
    expect(result?.agent?.name).toBe('Agent A');
  });

  it('marks unread=true when no read record exists', async () => {
    const convId = new Types.ObjectId();
    const conversation = {
      _id: convId,
      clientId: new Types.ObjectId(),
      contactId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'open',
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    };

    const repo = new ConversationRepository(
      buildFindOneModel({ conversation }) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
      buildFindOneLookup(null) as any,
    );

    const result = await repo.findOneForInboxEnriched(
      convId,
      new Types.ObjectId(),
      new Types.ObjectId(),
    );

    expect(result?.unread).toBe(true);
  });
});

describe('ConversationRepository.countConversationsByContacts', () => {
  function buildAggregateModel(rows: unknown) {
    const exec = jest.fn().mockResolvedValue(rows);
    const aggregate = jest.fn().mockReturnValue({ exec });
    return { aggregate, exec };
  }

  it('returns an empty Map when contactIds is empty (no DB roundtrip)', async () => {
    const chain = buildAggregateModel([]);
    const repo = buildRepo(
      { aggregate: chain.aggregate } as any,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const out = await repo.countConversationsByContacts(
      new Types.ObjectId(),
      [],
    );

    expect(out.size).toBe(0);
    expect(chain.aggregate).not.toHaveBeenCalled();
  });

  it('builds the $match + $group pipeline and projects a Map<idHex, n>', async () => {
    const c1 = new Types.ObjectId();
    const c2 = new Types.ObjectId();
    const rows = [
      { _id: c1, n: 3 },
      { _id: c2, n: 7 },
    ];
    const chain = buildAggregateModel(rows);
    const repo = buildRepo(
      { aggregate: chain.aggregate } as any,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const clientId = new Types.ObjectId();
    const out = await repo.countConversationsByContacts(clientId, [c1, c2]);

    expect(chain.aggregate).toHaveBeenCalledTimes(1);
    expect(chain.aggregate.mock.calls[0][0]).toEqual([
      { $match: { clientId, contactId: { $in: [c1, c2] } } },
      { $group: { _id: '$contactId', n: { $sum: 1 } } },
    ]);
    expect(out.get(String(c1))).toBe(3);
    expect(out.get(String(c2))).toBe(7);
  });

  it('returns a Map with entries only for contacts that have conversations (missing → caller treats as 0)', async () => {
    const c1 = new Types.ObjectId();
    const c2 = new Types.ObjectId();
    const c3 = new Types.ObjectId();
    const rows = [{ _id: c1, n: 1 }]; // c2 and c3 absent
    const chain = buildAggregateModel(rows);
    const repo = buildRepo(
      { aggregate: chain.aggregate } as any,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const out = await repo.countConversationsByContacts(new Types.ObjectId(), [
      c1,
      c2,
      c3,
    ]);

    expect(out.size).toBe(1);
    expect(out.get(String(c1))).toBe(1);
    expect(out.get(String(c2))).toBeUndefined();
    expect(out.get(String(c3))).toBeUndefined();
  });

  it('tenant-scopes the aggregation (clientId in $match)', async () => {
    const chain = buildAggregateModel([]);
    const repo = buildRepo(
      { aggregate: chain.aggregate } as any,
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
      buildLookupModel([]),
    );

    const clientId = new Types.ObjectId();
    await repo.countConversationsByContacts(clientId, [new Types.ObjectId()]);

    const pipeline = chain.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.clientId).toEqual(clientId);
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
