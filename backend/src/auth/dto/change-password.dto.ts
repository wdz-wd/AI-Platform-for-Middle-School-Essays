import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: '新密码至少 10 位' })
  @MaxLength(72, { message: '新密码不能超过 72 字节' })
  newPassword!: string;
}
