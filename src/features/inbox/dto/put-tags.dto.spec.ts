import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutTagsDto } from './put-tags.dto';

async function validateBody(payload: unknown) {
  const instance = plainToInstance(PutTagsDto, payload);
  return { instance, errors: await validate(instance as object) };
}

describe('PutTagsDto', () => {
  it('accepts an empty array', async () => {
    const { errors } = await validateBody({ tags: [] });
    expect(errors).toHaveLength(0);
  });

  it('accepts up to 16 valid tags', async () => {
    const tags = Array.from({ length: 16 }, (_, i) => `tag${i}`);
    const { errors } = await validateBody({ tags });
    expect(errors).toHaveLength(0);
  });

  it('rejects more than 16 tags', async () => {
    const tags = Array.from({ length: 17 }, (_, i) => `tag${i}`);
    const { errors } = await validateBody({ tags });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ arrayMaxSize: expect.any(String) }),
    );
  });

  it('rejects an empty string entry', async () => {
    const { errors } = await validateBody({ tags: ['ok', ''] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a string entry longer than 32 chars', async () => {
    const { errors } = await validateBody({ tags: ['x'.repeat(33)] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts the boundary characters . _ -', async () => {
    const { errors } = await validateBody({ tags: ['a.b_c-d'] });
    expect(errors).toHaveLength(0);
  });

  it('rejects whitespace inside tags', async () => {
    const { errors } = await validateBody({ tags: ['has space'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each(['!bad', '<bad>', 'na?me', 'na me'])(
    'rejects forbidden character in tag=%s',
    async (tag) => {
      const { errors } = await validateBody({ tags: [tag] });
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('rejects when tags is not an array', async () => {
    const { errors } = await validateBody({ tags: 'vip' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects missing tags field', async () => {
    const { errors } = await validateBody({});
    expect(errors.length).toBeGreaterThan(0);
  });
});
