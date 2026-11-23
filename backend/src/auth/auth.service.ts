import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return this.createSession(user);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    if (
      dto.newPassword.trim().length < 10 ||
      Buffer.byteLength(dto.newPassword) > 72
    ) {
      throw new BadRequestException(
        '新密码至少 10 位（不计首尾空格），最多 72 字节',
      );
    }
    const user = await this.usersService.findById(id);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('请重新登录');
    }
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('当前密码错误');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const { count } = await this.usersService.updatePassword(
      id,
      user.tokenVersion,
      passwordHash,
    );
    if (count !== 1) {
      throw new UnauthorizedException('账号状态已变化，请重新登录');
    }
    return this.createSession({
      ...user,
      mustChangePassword: false,
      tokenVersion: user.tokenVersion + 1,
    });
  }

  private async createSession(
    user: NonNullable<Awaited<ReturnType<UsersService['findSessionUser']>>>,
  ) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      ver: user.tokenVersion,
    });

    return {
      accessToken,
      user: this.usersService.sanitizeUser(user),
    };
  }
}
