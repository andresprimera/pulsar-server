import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import { ConversationReadRepository } from '@persistence/repositories/conversation-read.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { InboxConversationMutationService } from './inbox-conversation-mutation.service';
import { InsufficientPrivilegeException } from './exceptions/insufficient-privilege.exception';
import { OperatorNotInTenantException } from './exceptions/operator-not-in-tenant.exception';

interface Mocks {
  conversationRepository: jest.Mocked<ConversationRepository>;
  conversationReadRepository: jest.Mocked<ConversationReadRepository>;
  userRepository: jest.Mocked<UserRepository>;
}

function buildService(): { service: InboxConversationMutationService } & Mocks {
  const conversationRepository = {
    findByIdForClient: jest.fn(),
    updateStatusForClient: jest.fn(),
    updateAssignmentForClient: jest.fn(),
    updateTagsForClient: jest.fn(),
    findOneForInboxEnriched: jest.fn(),
  } as unknown as jest.Mocked<ConversationRepository>;
  const conversationReadRepository = {
    markRead: jest.fn().mockResolvedValue({}),
    markUnread: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ConversationReadRepository>;
  const userRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<UserRepository>;

  const service = new InboxConversationMutationService(
    conversationRepository,
    conversationReadRepository,
    userRepository,
  );

  return {
    service,
    conversationRepository,
    conversationReadRepository,
    userRepository,
  };
}

interface Fixture {
  clientId: Types.ObjectId;
  conversationId: Types.ObjectId;
  actorClientUserId: Types.ObjectId;
}

function buildFixture(): Fixture {
  return {
    clientId: new Types.ObjectId(),
    conversationId: new Types.ObjectId(),
    actorClientUserId: new Types.ObjectId(),
  };
}

function enrichedRow(fx: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    _id: fx.conversationId,
    clientId: fx.clientId,
    contactId: new Types.ObjectId(),
    channelId: new Types.ObjectId(),
    status: 'open',
    controlMode: 'human',
    lastMessageAt: new Date('2026-05-19T10:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    contact: { name: 'Jane' },
    channel: { type: 'whatsapp' },
    clientAgent: null,
    agent: null,
    assignedOperator: null,
    tags: [],
    unread: false,
    ...overrides,
  } as any;
}

describe('InboxConversationMutationService', () => {
  describe('changeStatus', () => {
    it('throws NotFoundException when conversation is not owned', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue(null);

      await expect(
        ctx.service.changeStatus({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          status: 'closed',
          actorClientUserId: fx.actorClientUserId.toHexString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(
        ctx.conversationRepository.updateStatusForClient,
      ).not.toHaveBeenCalled();
    });

    it('happy path writes and returns the enriched DTO', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        status: 'open',
      } as any);
      ctx.conversationRepository.updateStatusForClient.mockResolvedValue({
        _id: fx.conversationId,
        status: 'closed',
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx, { status: 'closed' }),
      );

      const dto = await ctx.service.changeStatus({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        status: 'closed',
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      expect(
        ctx.conversationRepository.updateStatusForClient,
      ).toHaveBeenCalled();
      expect(dto.status).toBe('closed');
    });

    it('idempotent no-op when status is unchanged (no DB write)', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        status: 'open',
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx, { status: 'open' }),
      );

      const dto = await ctx.service.changeStatus({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        status: 'open',
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      expect(
        ctx.conversationRepository.updateStatusForClient,
      ).not.toHaveBeenCalled();
      expect(dto.status).toBe('open');
    });

    it('emits structured log event with from/to status', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        status: 'open',
      } as any);
      ctx.conversationRepository.updateStatusForClient.mockResolvedValue({
        _id: fx.conversationId,
        status: 'closed',
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx, { status: 'closed' }),
      );

      const logSpy = jest
        .spyOn(
          (ctx.service as unknown as { logger: { log: (m: string) => void } })
            .logger,
          'log',
        )
        .mockImplementation();

      await ctx.service.changeStatus({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        status: 'closed',
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      const events = logSpy.mock.calls.map((c) => c[0] as string);
      expect(events.some((m) => m.includes('event=inbox.status.changed'))).toBe(
        true,
      );
      expect(events.some((m) => m.includes('fromStatus=open'))).toBe(true);
      expect(events.some((m) => m.includes('toStatus=closed'))).toBe(true);

      logSpy.mockRestore();
    });
  });

  describe('changeAssignment', () => {
    it('throws NotFoundException when conversation is missing', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue(null);

      await expect(
        ctx.service.changeAssignment({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          operatorClientUserId: new Types.ObjectId().toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
          actorClientRole: 'owner',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('owner can assign any operator (happy path)', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const targetId = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: undefined,
      } as any);
      ctx.userRepository.findById.mockResolvedValue({
        _id: targetId,
        clientId: fx.clientId,
        status: 'active',
      } as any);
      ctx.conversationRepository.updateAssignmentForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx),
      );

      await ctx.service.changeAssignment({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        operatorClientUserId: targetId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
        actorClientRole: 'owner',
      });

      expect(
        ctx.conversationRepository.updateAssignmentForClient,
      ).toHaveBeenCalled();
    });

    it('operator can assign self (happy path)', async () => {
      const ctx = buildService();
      const fx = buildFixture();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: undefined,
      } as any);
      ctx.userRepository.findById.mockResolvedValue({
        _id: fx.actorClientUserId,
        clientId: fx.clientId,
        status: 'active',
      } as any);
      ctx.conversationRepository.updateAssignmentForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx),
      );

      await ctx.service.changeAssignment({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        operatorClientUserId: fx.actorClientUserId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
        actorClientRole: 'operator',
      });

      expect(
        ctx.conversationRepository.updateAssignmentForClient,
      ).toHaveBeenCalled();
    });

    it('operator can unassign self (happy path)', async () => {
      const ctx = buildService();
      const fx = buildFixture();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: fx.actorClientUserId,
      } as any);
      ctx.conversationRepository.updateAssignmentForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx),
      );

      await ctx.service.changeAssignment({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        operatorClientUserId: null,
        actorClientUserId: fx.actorClientUserId.toHexString(),
        actorClientRole: 'operator',
      });

      expect(
        ctx.conversationRepository.updateAssignmentForClient,
      ).toHaveBeenCalled();
    });

    it('operator cannot assign another operator (403)', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const otherId = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: undefined,
      } as any);

      await expect(
        ctx.service.changeAssignment({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          operatorClientUserId: otherId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
          actorClientRole: 'operator',
        }),
      ).rejects.toBeInstanceOf(InsufficientPrivilegeException);

      expect(
        ctx.conversationRepository.updateAssignmentForClient,
      ).not.toHaveBeenCalled();
    });

    it('operator cannot unassign a conversation owned by another operator (403)', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const otherId = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: otherId,
      } as any);

      await expect(
        ctx.service.changeAssignment({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          operatorClientUserId: null,
          actorClientUserId: fx.actorClientUserId.toHexString(),
          actorClientRole: 'operator',
        }),
      ).rejects.toBeInstanceOf(InsufficientPrivilegeException);
    });

    it('returns 422 when target user does not exist', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const targetId = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: undefined,
      } as any);
      ctx.userRepository.findById.mockResolvedValue(null);

      await expect(
        ctx.service.changeAssignment({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          operatorClientUserId: targetId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
          actorClientRole: 'owner',
        }),
      ).rejects.toBeInstanceOf(OperatorNotInTenantException);
    });

    it('returns 422 when target user is in a different tenant', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const targetId = new Types.ObjectId();
      const otherTenant = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: undefined,
      } as any);
      ctx.userRepository.findById.mockResolvedValue({
        _id: targetId,
        clientId: otherTenant,
        status: 'active',
      } as any);

      await expect(
        ctx.service.changeAssignment({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          operatorClientUserId: targetId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
          actorClientRole: 'owner',
        }),
      ).rejects.toBeInstanceOf(OperatorNotInTenantException);
    });

    it('returns 422 when target user is inactive', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const targetId = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: undefined,
      } as any);
      ctx.userRepository.findById.mockResolvedValue({
        _id: targetId,
        clientId: fx.clientId,
        status: 'inactive',
      } as any);

      await expect(
        ctx.service.changeAssignment({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          operatorClientUserId: targetId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
          actorClientRole: 'owner',
        }),
      ).rejects.toBeInstanceOf(OperatorNotInTenantException);
    });

    it('idempotent: same assignment is a no-op', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      const targetId = new Types.ObjectId();

      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        assignedOperatorId: targetId,
      } as any);
      ctx.userRepository.findById.mockResolvedValue({
        _id: targetId,
        clientId: fx.clientId,
        status: 'active',
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx),
      );

      await ctx.service.changeAssignment({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        operatorClientUserId: targetId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
        actorClientRole: 'owner',
      });

      expect(
        ctx.conversationRepository.updateAssignmentForClient,
      ).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('throws NotFoundException when conversation is missing', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue(null);

      await expect(
        ctx.service.markRead({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(ctx.conversationReadRepository.markRead).not.toHaveBeenCalled();
    });

    it('happy path upserts and returns the response DTO', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);

      const dto = await ctx.service.markRead({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      expect(ctx.conversationReadRepository.markRead).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: fx.conversationId,
          operatorClientUserId: fx.actorClientUserId,
          clientId: fx.clientId,
        }),
      );
      expect(dto.unread).toBe(false);
      expect(dto.lastReadAt).toBeInstanceOf(Date);
    });

    it('idempotent re-call still issues the upsert', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);

      await ctx.service.markRead({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });
      await ctx.service.markRead({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      expect(ctx.conversationReadRepository.markRead).toHaveBeenCalledTimes(2);
    });
  });

  describe('markUnread', () => {
    it('throws NotFoundException when conversation is missing', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue(null);

      await expect(
        ctx.service.markUnread({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('happy path deletes and returns the response DTO', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);

      const dto = await ctx.service.markUnread({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      expect(ctx.conversationReadRepository.markUnread).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: fx.conversationId,
          operatorClientUserId: fx.actorClientUserId,
          clientId: fx.clientId,
        }),
      );
      expect(dto.unread).toBe(true);
      expect(dto.lastReadAt).toBeNull();
    });

    it('idempotent on missing record (repository no-op)', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);

      await ctx.service.markUnread({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });
      await expect(
        ctx.service.markUnread({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          actorClientUserId: fx.actorClientUserId.toHexString(),
        }),
      ).resolves.toEqual(expect.objectContaining({ unread: true }));
    });
  });

  describe('replaceTags', () => {
    it('throws NotFoundException when conversation is missing', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue(null);

      await expect(
        ctx.service.replaceTags({
          clientId: fx.clientId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          tags: ['vip'],
          actorClientUserId: fx.actorClientUserId.toHexString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('normalizes (trim + lowercase + dedupe) before writing', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        tags: [],
      } as any);
      ctx.conversationRepository.updateTagsForClient.mockResolvedValue({
        _id: fx.conversationId,
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx),
      );

      await ctx.service.replaceTags({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        tags: ['  VIP  ', 'vip', 'Urgent', 'urgent', '   '],
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      const call = ctx.conversationRepository.updateTagsForClient.mock.calls[0];
      expect(call[2]).toEqual(['vip', 'urgent']);
    });

    it('idempotent no-op when array equals existing', async () => {
      const ctx = buildService();
      const fx = buildFixture();
      ctx.conversationRepository.findByIdForClient.mockResolvedValue({
        _id: fx.conversationId,
        tags: ['vip', 'urgent'],
      } as any);
      ctx.conversationRepository.findOneForInboxEnriched.mockResolvedValue(
        enrichedRow(fx, { tags: ['vip', 'urgent'] }),
      );

      await ctx.service.replaceTags({
        clientId: fx.clientId.toHexString(),
        conversationId: fx.conversationId.toHexString(),
        tags: ['vip', 'urgent'],
        actorClientUserId: fx.actorClientUserId.toHexString(),
      });

      expect(
        ctx.conversationRepository.updateTagsForClient,
      ).not.toHaveBeenCalled();
    });
  });
});
