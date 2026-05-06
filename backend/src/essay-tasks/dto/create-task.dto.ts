import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  classIds?: string[];

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  topicText?: string;
}
