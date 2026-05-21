import 'reflect-metadata';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PatchAssignmentDto } from './patch-assignment.dto';

async function validateBody(payload: unknown) {
  const instance = plainToInstance(PatchAssignmentDto, payload);
  return { instance, errors: await validate(instance as object) };
}

describe('PatchAssignmentDto', () => {
  it('accepts a valid ObjectId string', async () => {
    const id = new Types.ObjectId().toHexString();
    const { errors } = await validateBody({ operatorClientUserId: id });
    expect(errors).toHaveLength(0);
  });

  it('accepts literal null', async () => {
    const { errors } = await validateBody({ operatorClientUserId: null });
    expect(errors).toHaveLength(0);
  });

  it('rejects an arbitrary non-ObjectId string', async () => {
    const { errors } = await validateBody({
      operatorClientUserId: 'not-an-id',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ isMongoId: expect.any(String) }),
    );
  });

  it('rejects undefined (must be either null or a Mongo ObjectId)', async () => {
    const { errors } = await validateBody({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a number', async () => {
    const { errors } = await validateBody({ operatorClientUserId: 42 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an object', async () => {
    const { errors } = await validateBody({
      operatorClientUserId: { foo: 'bar' },
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
