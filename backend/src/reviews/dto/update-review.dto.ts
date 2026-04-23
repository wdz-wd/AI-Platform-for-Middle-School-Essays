import { IsOptional, IsString } from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsString()
  teacherComment?: string;

  @IsOptional()
  @IsString()
  finalComment?: string;
}
