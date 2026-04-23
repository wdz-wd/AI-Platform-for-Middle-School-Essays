import { IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  classId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  topicText?: string;
}
