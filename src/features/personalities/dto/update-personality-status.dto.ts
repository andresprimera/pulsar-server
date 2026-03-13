import { IsIn } from 'class-validator';

export class UpdatePersonalityStatusDto {
  @IsIn(['active', 'inactive', 'archived'])
  status: 'active' | 'inactive' | 'archived';
}
