import { model, models, Types } from 'mongoose';
import { MessageSchema } from './message.schema';

describe('MessageSchema', () => {
  const MessageValidationModel =
    models.MessageValidationHarness ||
    model(
      'MessageValidationHarness',
      MessageSchema,
      'messages_validation_harness',
    );

  it('should fail validation for user message without contactId', async () => {
    const message = new MessageValidationModel({
      content: 'Hello',
      type: 'user',
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
      status: 'active',
    });

    await expect(message.validate()).rejects.toThrow(
      'contactId is required for user messages',
    );
  });

  it('should allow non-user message without contactId', async () => {
    const message = new MessageValidationModel({
      content: 'Agent response',
      type: 'agent',
      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
      status: 'active',
    });

    await expect(message.validate()).resolves.toBeUndefined();
  });

  it('should fail validation when conversationId is missing', async () => {
    const message = new MessageValidationModel({
      content: 'Agent response',
      type: 'agent',
      agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      status: 'active',
    });

    await expect(message.validate()).rejects.toThrow();
  });

  describe('Phase 2: type=human, deliveryStatus, partial-unique index', () => {
    it('accepts type=human when authorClientUserId is set', async () => {
      const message = new MessageValidationModel({
        content: 'Operator reply',
        type: 'human',
        authorClientUserId: new Types.ObjectId('507f1f77bcf86cd799439020'),
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
        conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
        status: 'active',
        deliveryStatus: 'pending',
        idempotencyKey: 'abcdef12-3456-4789-abcd-ef0123456789',
      });
      await expect(message.validate()).resolves.toBeUndefined();
    });

    it('rejects type=human without authorClientUserId', async () => {
      const message = new MessageValidationModel({
        content: 'Operator reply',
        type: 'human',
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
        conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
        status: 'active',
      });
      await expect(message.validate()).rejects.toThrow(
        'authorClientUserId is required for human messages',
      );
    });

    it.each(['pending', 'sent', 'failed'] as const)(
      'accepts deliveryStatus=%s on a human message',
      async (deliveryStatus) => {
        const message = new MessageValidationModel({
          content: 'Operator reply',
          type: 'human',
          authorClientUserId: new Types.ObjectId('507f1f77bcf86cd799439020'),
          clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
          channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
          conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
          status: 'active',
          deliveryStatus,
        });
        await expect(message.validate()).resolves.toBeUndefined();
      },
    );

    it('rejects deliveryStatus outside the enum', async () => {
      const message = new MessageValidationModel({
        content: 'Operator reply',
        type: 'human',
        authorClientUserId: new Types.ObjectId('507f1f77bcf86cd799439020'),
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
        conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
        status: 'active',
        deliveryStatus: 'queued' as any,
      });
      await expect(message.validate()).rejects.toThrow();
    });

    it('still validates user and agent branches', async () => {
      const userMsg = new MessageValidationModel({
        content: 'inbound',
        type: 'user',
        contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
        conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
        status: 'active',
      });
      await expect(userMsg.validate()).resolves.toBeUndefined();

      const agentMsg = new MessageValidationModel({
        content: 'response',
        type: 'agent',
        agentId: new Types.ObjectId('507f1f77bcf86cd799439013'),
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439014'),
        conversationId: new Types.ObjectId('507f1f77bcf86cd799439015'),
        status: 'active',
      });
      await expect(agentMsg.validate()).resolves.toBeUndefined();
    });

    it('exposes a partial-unique (conversationId, idempotencyKey) index on the schema', () => {
      const indexes = MessageSchema.indexes() as Array<
        [Record<string, number>, Record<string, unknown>]
      >;
      const idempotencyIndex = indexes.find(
        ([fields, opts]) =>
          fields.conversationId === 1 &&
          fields.idempotencyKey === 1 &&
          opts?.unique === true,
      );
      expect(idempotencyIndex).toBeDefined();
      const opts = idempotencyIndex?.[1] as Record<string, unknown>;
      expect(opts).toEqual(
        expect.objectContaining({
          unique: true,
          partialFilterExpression: { idempotencyKey: { $exists: true } },
        }),
      );
    });
  });
});
