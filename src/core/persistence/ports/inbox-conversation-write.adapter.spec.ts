import { Types } from 'mongoose';
import { InboxConversationWriteAdapter } from './inbox-conversation-write.adapter';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';

describe('InboxConversationWriteAdapter', () => {
  let repo: jest.Mocked<
    Pick<ConversationRepository, 'updateLastMessageAt' | 'setEnrichmentFields'>
  >;
  let adapter: InboxConversationWriteAdapter;

  beforeEach(() => {
    repo = {
      updateLastMessageAt: jest.fn(),
      setEnrichmentFields: jest.fn(),
    } as any;
    adapter = new InboxConversationWriteAdapter(repo as any);
  });

  it('updateLastMessageAt delegates to repository', async () => {
    const id = new Types.ObjectId();
    const ts = new Date();
    await adapter.updateLastMessageAt(id, ts, 'preview');

    expect(repo.updateLastMessageAt).toHaveBeenCalledWith(
      id,
      ts,
      'preview',
      undefined,
    );
  });

  it('updateLastMessageAt forwards session and undefined preview', async () => {
    const id = new Types.ObjectId();
    const ts = new Date();
    const session = {} as any;
    await adapter.updateLastMessageAt(id, ts, undefined, session);

    expect(repo.updateLastMessageAt).toHaveBeenCalledWith(
      id,
      ts,
      undefined,
      session,
    );
  });

  it('setEnrichmentFields delegates to repository', async () => {
    const id = new Types.ObjectId();
    const clientAgentId = new Types.ObjectId();
    const fields = {
      clientAgentId,
      contactNameLower: 'jane',
      lastMessagePreview: 'hi',
    };
    await adapter.setEnrichmentFields(id, fields);
    expect(repo.setEnrichmentFields).toHaveBeenCalledWith(id, fields);
  });
});
