import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InboxOperatorMessageService } from './inbox-operator-message.service';
import { BotAutopilotActiveException } from './exceptions/bot-autopilot-active.exception';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ContactRepository } from '@persistence/repositories/contact.repository';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import {
  MessageIdempotencyConflictError,
  MessageRepository,
} from '@persistence/repositories/message.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { MessagingGatewayService } from '@channels/gateway/messaging-gateway.service';
import { ConversationService } from '@domain/conversation/conversation.service';

interface ServiceMocks {
  conversationRepository: jest.Mocked<ConversationRepository>;
  messageRepository: jest.Mocked<MessageRepository>;
  userRepository: jest.Mocked<UserRepository>;
  channelRepository: jest.Mocked<ChannelRepository>;
  clientAgentRepository: jest.Mocked<ClientAgentRepository>;
  contactRepository: jest.Mocked<ContactRepository>;
  messagingGatewayService: jest.Mocked<MessagingGatewayService>;
  conversationService: jest.Mocked<ConversationService>;
}

function buildService(): {
  service: InboxOperatorMessageService;
} & ServiceMocks {
  const conversationRepository = {
    findByIdForClient: jest.fn(),
  } as unknown as jest.Mocked<ConversationRepository>;
  const messageRepository = {
    findByIdempotencyKey: jest.fn(),
    createOperatorMessage: jest.fn(),
    updateDeliveryStatus: jest.fn(),
  } as unknown as jest.Mocked<MessageRepository>;
  const userRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<UserRepository>;
  const channelRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<ChannelRepository>;
  const clientAgentRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<ClientAgentRepository>;
  const contactRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<ContactRepository>;
  const messagingGatewayService = {
    send: jest.fn(),
  } as unknown as jest.Mocked<MessagingGatewayService>;
  const conversationService = {
    touch: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ConversationService>;

  const service = new InboxOperatorMessageService(
    conversationRepository,
    messageRepository,
    userRepository,
    channelRepository,
    clientAgentRepository,
    contactRepository,
    messagingGatewayService,
    conversationService,
  );

  return {
    service,
    conversationRepository,
    messageRepository,
    userRepository,
    channelRepository,
    clientAgentRepository,
    contactRepository,
    messagingGatewayService,
    conversationService,
  };
}

interface Fixture {
  clientId: Types.ObjectId;
  conversationId: Types.ObjectId;
  channelId: Types.ObjectId;
  contactId: Types.ObjectId;
  clientAgentId: Types.ObjectId;
  authorClientUserId: Types.ObjectId;
  messageId: Types.ObjectId;
  idempotencyKey: string;
  text: string;
}

function buildFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    clientId: new Types.ObjectId(),
    conversationId: new Types.ObjectId(),
    channelId: new Types.ObjectId(),
    contactId: new Types.ObjectId(),
    clientAgentId: new Types.ObjectId(),
    authorClientUserId: new Types.ObjectId(),
    messageId: new Types.ObjectId(),
    idempotencyKey: 'abcdef12-3456-4789-abcd-ef0123456789',
    text: 'Operator reply',
    ...overrides,
  };
}

function stubHappyPath(
  mocks: ServiceMocks,
  fx: Fixture,
  channelType: 'whatsapp' | 'telegram' | 'instagram' | 'tiktok',
  controlMode: 'human' | 'bot' = 'human',
) {
  mocks.conversationRepository.findByIdForClient.mockResolvedValue({
    _id: fx.conversationId,
    clientId: fx.clientId,
    contactId: fx.contactId,
    channelId: fx.channelId,
    clientAgentId: fx.clientAgentId,
    controlMode,
  } as any);
  mocks.channelRepository.findById.mockResolvedValue({
    _id: fx.channelId,
    type: channelType,
  } as any);
  mocks.clientAgentRepository.findById.mockResolvedValue({
    _id: fx.clientAgentId,
    channels: [
      {
        channelId: fx.channelId,
        provider:
          channelType === 'whatsapp'
            ? 'meta'
            : channelType === 'telegram'
            ? 'telegram'
            : channelType === 'instagram'
            ? 'meta'
            : 'tiktok',
        credentials: { encrypted: 'opaque' },
      },
    ],
  } as any);
  mocks.contactRepository.findById.mockResolvedValue({
    _id: fx.contactId,
    externalId: '+1234567890',
  } as any);
  mocks.messageRepository.findByIdempotencyKey.mockResolvedValue(null);
  mocks.messageRepository.createOperatorMessage.mockResolvedValue({
    _id: fx.messageId,
    conversationId: fx.conversationId,
    content: fx.text,
    type: 'human',
    authorClientUserId: fx.authorClientUserId,
    deliveryStatus: 'pending',
    createdAt: new Date('2026-05-21T00:00:00.000Z'),
  } as any);
  mocks.messageRepository.updateDeliveryStatus.mockImplementation(
    async (_id, status) =>
      ({
        _id: fx.messageId,
        conversationId: fx.conversationId,
        content: fx.text,
        type: 'human',
        authorClientUserId: fx.authorClientUserId,
        deliveryStatus: status,
        createdAt: new Date('2026-05-21T00:00:00.000Z'),
      } as any),
  );
  mocks.userRepository.findById.mockResolvedValue({
    _id: fx.authorClientUserId,
    name: 'Maria Q.',
  } as any);
  mocks.messagingGatewayService.send.mockResolvedValue(undefined);
}

function inputFromFixture(fx: Fixture) {
  return {
    clientId: fx.clientId.toHexString(),
    conversationId: fx.conversationId.toHexString(),
    authorClientUserId: fx.authorClientUserId.toHexString(),
    text: fx.text,
    idempotencyKey: fx.idempotencyKey,
  };
}

describe('InboxOperatorMessageService', () => {
  it('throws BotAutopilotActiveException when conversation is not in human mode', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'whatsapp', 'bot');

    await expect(
      ctx.service.sendOperatorMessage(inputFromFixture(fx)),
    ).rejects.toBeInstanceOf(BotAutopilotActiveException);

    expect(ctx.messagingGatewayService.send).not.toHaveBeenCalled();
    expect(ctx.messageRepository.createOperatorMessage).not.toHaveBeenCalled();
    expect(ctx.conversationService.touch).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when conversation is not owned by client', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    ctx.conversationRepository.findByIdForClient.mockResolvedValue(null);

    await expect(
      ctx.service.sendOperatorMessage(inputFromFixture(fx)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.messagingGatewayService.send).not.toHaveBeenCalled();
  });

  it.each([['whatsapp'], ['telegram'], ['instagram'], ['tiktok']] as const)(
    'happy path for channel=%s: persists, dispatches, marks sent, touches, returns DTO',
    async (channelType) => {
      const ctx = buildService();
      const fx = buildFixture();
      stubHappyPath(ctx, fx, channelType);

      const dto = await ctx.service.sendOperatorMessage(inputFromFixture(fx));

      expect(ctx.messageRepository.createOperatorMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: fx.conversationId,
          authorClientUserId: fx.authorClientUserId,
          idempotencyKey: fx.idempotencyKey,
          content: fx.text,
        }),
      );
      expect(ctx.messagingGatewayService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: channelType,
          to: '+1234567890',
          message: fx.text,
        }),
      );
      expect(ctx.messageRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        fx.messageId,
        'sent',
      );
      expect(ctx.conversationService.touch).toHaveBeenCalledWith(
        fx.conversationId,
        expect.any(Date),
        fx.text,
      );

      expect(dto).toEqual(
        expect.objectContaining({
          _id: fx.messageId.toHexString(),
          conversationId: fx.conversationId.toHexString(),
          type: 'human',
          sender: 'human',
          deliveryStatus: 'sent',
          authorName: 'Maria Q.',
          authorClientUserId: fx.authorClientUserId.toHexString(),
        }),
      );
    },
  );

  it('asserts the 5-step monotone order (persist → dispatch → update → touch)', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'whatsapp');

    const calls: string[] = [];
    ctx.messageRepository.createOperatorMessage.mockImplementationOnce(
      async () => {
        calls.push('createOperatorMessage');
        return {
          _id: fx.messageId,
          conversationId: fx.conversationId,
          content: fx.text,
          type: 'human',
          authorClientUserId: fx.authorClientUserId,
          deliveryStatus: 'pending',
        } as any;
      },
    );
    ctx.messagingGatewayService.send.mockImplementationOnce(async () => {
      calls.push('gateway.send');
    });
    ctx.messageRepository.updateDeliveryStatus.mockImplementationOnce(
      async (_id, status) => {
        calls.push(`updateDeliveryStatus:${status}`);
        return {
          _id: fx.messageId,
          conversationId: fx.conversationId,
          content: fx.text,
          // `type` must be present on the returned row: the inbox-wire
          // mapper now throws on unknown `Message.type` values to catch
          // future regressions where a `'summary'` row leaks past the
          // repository filter. Mirror the real repo's projection.
          type: 'human',
          authorClientUserId: fx.authorClientUserId,
          deliveryStatus: status,
        } as any;
      },
    );
    ctx.conversationService.touch.mockImplementationOnce(async () => {
      calls.push('touch');
    });

    await ctx.service.sendOperatorMessage(inputFromFixture(fx));

    expect(calls).toEqual([
      'createOperatorMessage',
      'gateway.send',
      'updateDeliveryStatus:sent',
      'touch',
    ]);
  });

  it('cheap-path replay (P4): returns prior row, skips create, skips dispatch, skips touch', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'whatsapp');

    const prior = {
      _id: fx.messageId,
      conversationId: fx.conversationId,
      content: fx.text,
      type: 'human',
      authorClientUserId: fx.authorClientUserId,
      deliveryStatus: 'sent',
      createdAt: new Date('2026-05-21T00:00:00.000Z'),
    } as any;
    ctx.messageRepository.findByIdempotencyKey.mockResolvedValueOnce(prior);

    const dto = await ctx.service.sendOperatorMessage(inputFromFixture(fx));

    expect(dto._id).toBe(fx.messageId.toHexString());
    expect(dto.deliveryStatus).toBe('sent');
    expect(ctx.messageRepository.createOperatorMessage).not.toHaveBeenCalled();
    expect(ctx.messagingGatewayService.send).not.toHaveBeenCalled();
    expect(ctx.conversationService.touch).not.toHaveBeenCalled();
  });

  it('E11000 race recovery: returns prior row after MessageIdempotencyConflictError, skips dispatch', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'whatsapp');

    ctx.messageRepository.createOperatorMessage.mockRejectedValueOnce(
      new MessageIdempotencyConflictError(),
    );
    const prior = {
      _id: fx.messageId,
      conversationId: fx.conversationId,
      content: fx.text,
      type: 'human',
      authorClientUserId: fx.authorClientUserId,
      deliveryStatus: 'sent',
    } as any;
    // First call (P4) returns null, second call (race recovery) returns prior.
    ctx.messageRepository.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(prior);

    const dto = await ctx.service.sendOperatorMessage(inputFromFixture(fx));

    expect(dto._id).toBe(fx.messageId.toHexString());
    expect(ctx.messagingGatewayService.send).not.toHaveBeenCalled();
    expect(ctx.conversationService.touch).not.toHaveBeenCalled();
  });

  it('downstream failure: persists pending, marks failed, touches, throws BadGatewayException', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'whatsapp');
    ctx.messagingGatewayService.send.mockRejectedValueOnce(
      new Error('Channel API 500'),
    );

    await expect(
      ctx.service.sendOperatorMessage(inputFromFixture(fx)),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(ctx.messageRepository.createOperatorMessage).toHaveBeenCalledTimes(
      1,
    );
    expect(ctx.messageRepository.updateDeliveryStatus).toHaveBeenCalledWith(
      fx.messageId,
      'failed',
    );
    // Touch fires on failure too (Locked Decision #4).
    expect(ctx.conversationService.touch).toHaveBeenCalledWith(
      fx.conversationId,
      expect.any(Date),
      fx.text,
    );
  });

  it('emits the four observability events for happy path', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'telegram');

    // Spy via the service's internal logger instance.
    const logSpy = jest
      .spyOn(
        (ctx.service as unknown as { logger: { log: (m: string) => void } })
          .logger,
        'log',
      )
      .mockImplementation();

    await ctx.service.sendOperatorMessage(inputFromFixture(fx));

    const events = logSpy.mock.calls.map((c) => c[0] as string);
    expect(
      events.some((m) => m.includes('event=inbox.operator.send.started')),
    ).toBe(true);
    expect(
      events.some((m) => m.includes('event=inbox.operator.send.persisted')),
    ).toBe(true);
    expect(
      events.some((m) => m.includes('event=inbox.operator.send.sent')),
    ).toBe(true);

    logSpy.mockRestore();
  });

  it('emits the failed observability event on dispatch error', async () => {
    const ctx = buildService();
    const fx = buildFixture();
    stubHappyPath(ctx, fx, 'instagram');
    ctx.messagingGatewayService.send.mockRejectedValueOnce(new Error('boom'));

    const warnSpy = jest
      .spyOn(
        (ctx.service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation();

    await expect(
      ctx.service.sendOperatorMessage(inputFromFixture(fx)),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const warnEvents = warnSpy.mock.calls.map((c) => c[0] as string);
    expect(
      warnEvents.some((m) => m.includes('event=inbox.operator.send.failed')),
    ).toBe(true);

    warnSpy.mockRestore();
  });
});
