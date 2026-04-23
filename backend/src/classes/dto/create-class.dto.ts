import { IsOptional, IsString } from 'class-validator';

export class CreateClassDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;
}
