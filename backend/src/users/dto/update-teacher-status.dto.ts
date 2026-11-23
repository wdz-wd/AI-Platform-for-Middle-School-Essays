import { IsIn } from 'class-validator';

export class UpdateTeacherStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}
