import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

const ALLOW_PASSWORD_CHANGE_REQUIRED = 'allowPasswordChangeRequired';
export const AllowPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    await super.canActivate(context);
    const user = context
      .switchToHttp()
      .getRequest<{ user: { mustChangePassword: boolean } }>().user;
    if (
      user.mustChangePassword &&
      !this.reflector.get<boolean>(
        ALLOW_PASSWORD_CHANGE_REQUIRED,
        context.getHandler(),
      )
    ) {
      throw new ForbiddenException({
        message: '请先修改初始密码',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return true;
  }
}
