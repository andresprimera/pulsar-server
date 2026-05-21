import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListInboxContactsQueryDto } from './list-inbox-contacts-query.dto';

async function validateBody(payload: unknown) {
  const instance = plainToInstance(ListInboxContactsQueryDto, payload);
  return { instance, errors: await validate(instance as object) };
}

describe('ListInboxContactsQueryDto', () => {
  it('accepts an empty body', async () => {
    const { errors } = await validateBody({});
    expect(errors).toHaveLength(0);
  });

  it('accepts a string cursor', async () => {
    const { errors } = await validateBody({ cursor: 'opaque-cursor' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string cursor', async () => {
    const { errors } = await validateBody({ cursor: 12 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cursor');
  });

  it('accepts limit at the lower boundary (1)', async () => {
    const { instance, errors } = await validateBody({ limit: 1 });
    expect(errors).toHaveLength(0);
    expect(instance.limit).toBe(1);
  });

  it('accepts limit at the upper boundary (100)', async () => {
    const { instance, errors } = await validateBody({ limit: 100 });
    expect(errors).toHaveLength(0);
    expect(instance.limit).toBe(100);
  });

  it('accepts a mid-range limit (50)', async () => {
    const { errors } = await validateBody({ limit: 50 });
    expect(errors).toHaveLength(0);
  });

  it('coerces a numeric string into a number via @Type', async () => {
    const { instance, errors } = await validateBody({ limit: '25' });
    expect(errors).toHaveLength(0);
    expect(instance.limit).toBe(25);
  });

  it('rejects limit below the lower boundary (0)', async () => {
    const { errors } = await validateBody({ limit: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ min: expect.any(String) }),
    );
  });

  it('rejects limit above the upper boundary (101)', async () => {
    const { errors } = await validateBody({ limit: 101 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ max: expect.any(String) }),
    );
  });

  it('rejects a non-integer limit', async () => {
    const { errors } = await validateBody({ limit: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isInt: expect.any(String) }),
    );
  });

  it('rejects a non-numeric limit string', async () => {
    const { errors } = await validateBody({ limit: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
  });
});
