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
});
