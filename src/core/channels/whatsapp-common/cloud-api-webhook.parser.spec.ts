import { parseCloudApiWebhook } from './cloud-api-webhook.parser';

describe('parseCloudApiWebhook', () => {
  const createPayload = (overrides: any = {}) => ({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '1234567890',
                  id: 'msg123',
                  type: 'text',
                  text: { body: 'Hello' },
                  ...overrides.message,
                },
              ],
              metadata: {
                phone_number_id: 'phone123',
                ...overrides.metadata,
              },
            },
          },
        ],
      },
    ],
  });

  it('parses a valid text message payload', () => {
    expect(parseCloudApiWebhook(createPayload())).toEqual({
      phoneNumberId: 'phone123',
      senderId: '1234567890',
      messageId: 'msg123',
      text: 'Hello',
    });
  });

  it('returns undefined for null/undefined', () => {
    expect(parseCloudApiWebhook(null)).toBeUndefined();
    expect(parseCloudApiWebhook(undefined)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(parseCloudApiWebhook({})).toBeUndefined();
  });

  it('returns undefined for non-text message', () => {
    expect(
      parseCloudApiWebhook(createPayload({ message: { type: 'image' } })),
    ).toBeUndefined();
  });

  it('returns undefined when phone_number_id is missing', () => {
    expect(
      parseCloudApiWebhook(
        createPayload({ metadata: { phone_number_id: undefined } }),
      ),
    ).toBeUndefined();
  });

  it('returns undefined when text body is missing', () => {
    expect(
      parseCloudApiWebhook(
        createPayload({ message: { text: { body: undefined } } }),
      ),
    ).toBeUndefined();
  });

  it('returns undefined when message id is missing', () => {
    expect(
      parseCloudApiWebhook(createPayload({ message: { id: undefined } })),
    ).toBeUndefined();
  });

  it('returns undefined for status update payloads (no messages)', () => {
    expect(
      parseCloudApiWebhook({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: 'status1' }],
                  metadata: { phone_number_id: 'phone123' },
                },
              },
            ],
          },
        ],
      }),
    ).toBeUndefined();
  });
});
