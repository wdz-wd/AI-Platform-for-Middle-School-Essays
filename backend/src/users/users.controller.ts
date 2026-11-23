import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherStatusDto } from './dto/update-teacher-status.dto';
import { UsersService } from './users.service';

@Controller('teachers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.listTeachers();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateTeacherDto) {
    return this.usersService.createTeacher(dto);
  }

  @Post(':id/reset-password')
  @Header('Cache-Control', 'no-store')
  resetPassword(@Param('id') id: string) {
    return this.usersService.resetTeacherPassword(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTeacherStatusDto) {
    return this.usersService.updateTeacherStatus(id, dto.status);
  }
}
