import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PatchStatusDto } from './patch-status.dto';

async function validateBody(payload: unknown) {
  const instance = plainToInstance(PatchStatusDto, payload);
  return { instance, errors: await validate(instance as object) };
}

describe('PatchStatusDto', () => {
  it.each(['open', 'closed', 'archived'])(
    'accepts status=%s',
    async (status) => {
      const { errors } = await validateBody({ status });
      expect(errors).toHaveLength(0);
    },
  );

  it('rejects an unknown status', async () => {
    const { errors } = await validateBody({ status: 'unknown' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isIn: expect.any(String) }),
    );
  });

  it('rejects missing status', async () => {
    const { errors } = await validateBody({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('status');
  });

  it('rejects an empty string', async () => {
    const { errors } = await validateBody({ status: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-string value', async () => {
    const { errors } = await validateBody({ status: 42 });
    expect(errors.length).toBeGreaterThan(0);
  });
});
