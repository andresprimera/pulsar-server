import { model, models, Types } from 'mongoose';
import {
  ConversationRead,
  ConversationReadSchema,
} from './conversation-read.schema';

describe('ConversationReadSchema', () => {
  const ConversationReadValidationModel =
    models.ConversationReadValidationHarness ||
    model<ConversationRead>(
      'ConversationReadValidationHarness',
      ConversationReadSchema,
      'conversation_reads_validation_harness',
    );

  it('accepts a valid document with all required fields', async () => {
    const doc = new ConversationReadValidationModel({
      conversationId: new Types.ObjectId(),
      operatorClientUserId: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      lastReadAt: new Date(),
    });

    await expect(doc.validate()).resolves.toBeUndefined();
  });

  it('requires conversationId', async () => {
    const doc = new ConversationReadValidationModel({
      operatorClientUserId: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      lastReadAt: new Date(),
    });
    await expect(doc.validate()).rejects.toThrow();
  });

  it('requires operatorClientUserId', async () => {
    const doc = new ConversationReadValidationModel({
      conversationId: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      lastReadAt: new Date(),
    });
    await expect(doc.validate()).rejects.toThrow();
  });

  it('requires clientId', async () => {
    const doc = new ConversationReadValidationModel({
      conversationId: new Types.ObjectId(),
      operatorClientUserId: new Types.ObjectId(),
      lastReadAt: new Date(),
    });
    await expect(doc.validate()).rejects.toThrow();
  });

  it('requires lastReadAt', async () => {
    const doc = new ConversationReadValidationModel({
      conversationId: new Types.ObjectId(),
      operatorClientUserId: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
    });
    await expect(doc.validate()).rejects.toThrow();
  });

  it('declares the unique compound index (conversationId, operatorClientUserId)', () => {
    const indexes = ConversationReadSchema.indexes();
    const uniqueIndex = indexes.find(
      ([fields, options]) =>
        (fields as Record<string, unknown>).conversationId === 1 &&
        (fields as Record<string, unknown>).operatorClientUserId === 1 &&
        (options as { unique?: boolean } | undefined)?.unique === true,
    );

    expect(uniqueIndex).toBeDefined();
    expect((uniqueIndex?.[1] as { name?: string } | undefined)?.name).toBe(
      'conv_read_unique',
    );
  });

  it('declares the by-operator lookup index', () => {
    const indexes = ConversationReadSchema.indexes();
    const lookupIndex = indexes.find(
      ([fields, options]) =>
        (fields as Record<string, unknown>).operatorClientUserId === 1 &&
        (fields as Record<string, unknown>).conversationId === 1 &&
        (options as { unique?: boolean } | undefined)?.unique !== true,
    );

    expect(lookupIndex).toBeDefined();
    expect((lookupIndex?.[1] as { name?: string } | undefined)?.name).toBe(
      'conv_read_by_operator_idx',
    );
  });

  it('uses the collection name conversation_reads', () => {
    const options = (
      ConversationReadSchema as unknown as {
        options: { collection?: string; timestamps?: boolean };
      }
    ).options;
    expect(options.collection).toBe('conversation_reads');
  });

  it('declares timestamps: true on the schema', () => {
    const options = (
      ConversationReadSchema as unknown as {
        options: { collection?: string; timestamps?: boolean };
      }
    ).options;
    expect(options.timestamps).toBe(true);
  });
});
