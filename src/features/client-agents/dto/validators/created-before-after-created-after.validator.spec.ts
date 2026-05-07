import { validate } from 'class-validator';
import { CreatedBeforeAfterCreatedAfter } from './created-before-after-created-after.validator';

@CreatedBeforeAfterCreatedAfter()
class TestDto {
  createdBefore?: Date;
  createdAfter?: Date;

  constructor(init?: Partial<TestDto>) {
    if (init) Object.assign(this, init);
  }
}

describe('CreatedBeforeAfterCreatedAfter validator', () => {
  it('is valid when both fields are absent', async () => {
    const errors = await validate(new TestDto());
    expect(errors).toHaveLength(0);
  });

  it('is valid when only createdAfter is present', async () => {
    const errors = await validate(
      new TestDto({ createdAfter: new Date('2024-01-01T00:00:00Z') }),
    );
    expect(errors).toHaveLength(0);
  });

  it('is valid when only createdBefore is present', async () => {
    const errors = await validate(
      new TestDto({ createdBefore: new Date('2024-01-01T00:00:00Z') }),
    );
    expect(errors).toHaveLength(0);
  });

  it('is valid when both are present and before === after', async () => {
    const date = new Date('2024-06-01T00:00:00Z');
    const errors = await validate(
      new TestDto({ createdBefore: date, createdAfter: date }),
    );
    expect(errors).toHaveLength(0);
  });

  it('is valid when both are present and before > after', async () => {
    const errors = await validate(
      new TestDto({
        createdBefore: new Date('2024-12-01T00:00:00Z'),
        createdAfter: new Date('2024-01-01T00:00:00Z'),
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('is invalid when before < after, with the expected message', async () => {
    const errors = await validate(
      new TestDto({
        createdBefore: new Date('2024-01-01T00:00:00Z'),
        createdAfter: new Date('2024-12-01T00:00:00Z'),
      }),
    );
    expect(errors).toHaveLength(1);
    const messages = Object.values(errors[0].constraints ?? {});
    expect(messages).toContain(
      'createdBefore must be greater than or equal to createdAfter',
    );
  });
});
