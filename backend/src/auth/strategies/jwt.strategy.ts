import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

type JwtPayload = {
  sub: string;
  ver?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findSessionUser(payload.sub);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.tokenVersion !== (payload.ver ?? 0)
    ) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    return this.usersService.sanitizeUser(user);
  }
}
