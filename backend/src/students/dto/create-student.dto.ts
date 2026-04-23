import { IsOptional, IsString } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  classId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  studentNo?: string;

  @IsOptional()
  @IsString()
  gender?: string;
}
