import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AllowPasswordChangeRequired,
  JwtAuthGuard,
} from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  @Get('me')
  me(@CurrentUser() user: CurrentUserType) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  @Post('change-password')
  @Header('Cache-Control', 'no-store')
  changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}
