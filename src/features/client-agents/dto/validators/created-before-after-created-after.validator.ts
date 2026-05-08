import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'createdBeforeAfterCreatedAfter', async: false })
export class CreatedBeforeAfterCreatedAfterConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { createdBefore?: Date; createdAfter?: Date };
    if (!obj.createdBefore || !obj.createdAfter) return true;
    return obj.createdBefore.getTime() >= obj.createdAfter.getTime();
  }

  defaultMessage(): string {
    return 'createdBefore must be greater than or equal to createdAfter';
  }
}

type AnyConstructor = new (...args: unknown[]) => object;

export function CreatedBeforeAfterCreatedAfter(
  options?: ValidationOptions,
): ClassDecorator {
  return (target) => {
    registerDecorator({
      target: target as unknown as AnyConstructor,
      propertyName: '__createdBeforeAfterCreatedAfter__',
      options,
      validator: CreatedBeforeAfterCreatedAfterConstraint,
    });
  };
}
