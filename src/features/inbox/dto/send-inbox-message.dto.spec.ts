import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendInboxMessageDto } from './send-inbox-message.dto';

async function validateBody(payload: unknown) {
  const instance = plainToInstance(SendInboxMessageDto, payload);
  return { instance, errors: await validate(instance as object) };
}

describe('SendInboxMessageDto', () => {
  it('accepts a non-empty text', async () => {
    const { instance, errors } = await validateBody({ text: 'hi there' });
    expect(errors).toHaveLength(0);
    expect((instance as SendInboxMessageDto).text).toBe('hi there');
  });

  it('trims surrounding whitespace before length validation', async () => {
    const { instance, errors } = await validateBody({ text: '   hello   ' });
    expect(errors).toHaveLength(0);
    expect((instance as SendInboxMessageDto).text).toBe('hello');
  });

  it('rejects an all-whitespace text as empty after trim', async () => {
    const { errors } = await validateBody({ text: '     ' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ minLength: expect.any(String) }),
    );
  });

  it('rejects an empty string text', async () => {
    const { errors } = await validateBody({ text: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ minLength: expect.any(String) }),
    );
  });

  it('rejects when text is missing entirely', async () => {
    const { errors } = await validateBody({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('text');
  });

  it('rejects a non-string text', async () => {
    const { errors } = await validateBody({ text: 42 });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isString: expect.any(String) }),
    );
  });

  it('accepts text at the 4096-character ceiling', async () => {
    const text = 'a'.repeat(4096);
    const { errors } = await validateBody({ text });
    expect(errors).toHaveLength(0);
  });

  it('rejects text longer than 4096 characters', async () => {
    const text = 'a'.repeat(4097);
    const { errors } = await validateBody({ text });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ maxLength: expect.any(String) }),
    );
  });
});
