import { IsOptional, IsString } from 'class-validator';

export class QueryStudentsDto {
  @IsOptional()
  @IsString()
  classId?: string;
}
