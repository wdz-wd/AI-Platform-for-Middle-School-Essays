import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateTeacherDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}$/, {
    message:
      '账号限 1 到 40 位字母、数字、点、下划线或连字符，须以字母或数字开头',
  })
  username!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '请输入教师姓名' })
  @MaxLength(40, { message: '教师姓名不能超过 40 个字' })
  displayName!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  classIds!: string[];
}
