import { IsOptional, IsString } from 'class-validator';

export class BindStudentDto {
  @IsOptional()
  @IsString()
  studentId?: string;
}
