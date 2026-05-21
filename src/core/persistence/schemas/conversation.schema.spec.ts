import { model, models, Types } from 'mongoose';
import { ConversationSchema } from './conversation.schema';

describe('ConversationSchema', () => {
  const ConversationValidationModel =
    models.ConversationValidationHarness ||
    model(
      'ConversationValidationHarness',
      ConversationSchema,
      'conversations_validation_harness',
    );

  it('requires lastMessageAt', async () => {
    const conversation = new ConversationValidationModel({
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      status: 'open',
    });

    await expect(conversation.validate()).rejects.toThrow();
  });

  it('accepts valid conversation document', async () => {
    const conversation = new ConversationValidationModel({
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
      status: 'open',
      lastMessageAt: new Date(),
    });

    await expect(conversation.validate()).resolves.toBeUndefined();
  });

  it('defines partial unique index for one open conversation per client/contact/channel', () => {
    const indexes = ConversationSchema.indexes();

    const uniqueOpenIndex = indexes.find(
      ([fields, options]) =>
        fields.clientId === 1 &&
        fields.contactId === 1 &&
        fields.channelId === 1 &&
        options?.unique === true,
    );

    expect(uniqueOpenIndex).toBeDefined();
    expect(uniqueOpenIndex?.[1]).toMatchObject({
      partialFilterExpression: {
        status: 'open',
      },
      unique: true,
    });
  });

  it('enforces partial unique index for open conversations', () => {
    const indexes = ConversationSchema.indexes();

    const hasPartial = indexes.some(
      ([fields, options]) =>
        fields.clientId === 1 &&
        fields.contactId === 1 &&
        fields.channelId === 1 &&
        options?.unique === true &&
        options?.partialFilterExpression?.status === 'open',
    );

    expect(hasPartial).toBe(true);
  });

  describe('Phase 3 fields', () => {
    it('assignedOperatorId is optional', async () => {
      const conversation = new ConversationValidationModel({
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
        status: 'open',
        lastMessageAt: new Date(),
      });

      await expect(conversation.validate()).resolves.toBeUndefined();
      expect(conversation.assignedOperatorId).toBeUndefined();
    });

    it('assignedOperatorId accepts a Types.ObjectId', async () => {
      const operatorId = new Types.ObjectId();
      const conversation = new ConversationValidationModel({
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
        status: 'open',
        lastMessageAt: new Date(),
        assignedOperatorId: operatorId,
      });

      await expect(conversation.validate()).resolves.toBeUndefined();
      expect(String(conversation.assignedOperatorId)).toBe(String(operatorId));
    });

    it('declares a single-field index on assignedOperatorId', () => {
      const indexes = ConversationSchema.indexes();
      const hasIndex = indexes.some(
        ([fields]) =>
          (fields as Record<string, unknown>).assignedOperatorId === 1,
      );
      expect(hasIndex).toBe(true);
    });

    it('tags defaults to [] when omitted', async () => {
      const conversation = new ConversationValidationModel({
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
        status: 'open',
        lastMessageAt: new Date(),
      });

      await expect(conversation.validate()).resolves.toBeUndefined();
      expect(conversation.tags).toEqual([]);
    });

    it('tags accepts a string array', async () => {
      const conversation = new ConversationValidationModel({
        clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
        contactId: new Types.ObjectId('507f1f77bcf86cd799439012'),
        channelId: new Types.ObjectId('507f1f77bcf86cd799439013'),
        status: 'open',
        lastMessageAt: new Date(),
        tags: ['vip', 'urgent'],
      });

      await expect(conversation.validate()).resolves.toBeUndefined();
      expect(conversation.tags).toEqual(['vip', 'urgent']);
    });

    it('declares a single-field index on tags', () => {
      const indexes = ConversationSchema.indexes();
      const hasIndex = indexes.some(
        ([fields]) => (fields as Record<string, unknown>).tags === 1,
      );
      expect(hasIndex).toBe(true);
    });
  });
});
