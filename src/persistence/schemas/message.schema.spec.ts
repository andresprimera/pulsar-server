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
});
