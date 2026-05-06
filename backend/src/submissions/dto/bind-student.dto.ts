import { IsOptional, IsString } from 'class-validator';

export class BindStudentDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}
