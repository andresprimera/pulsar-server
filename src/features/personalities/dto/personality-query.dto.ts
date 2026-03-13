import { IsOptional, IsIn } from 'class-validator';

export class PersonalityQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'archived'])
  status?: 'active' | 'inactive' | 'archived';
}
