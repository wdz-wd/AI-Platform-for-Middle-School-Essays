import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { CreateStudentDto } from './dto/create-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@UseGuards(JwtAuthGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  list(
    @Query() query: QueryStudentsDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.studentsService.list(query, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.studentsService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.studentsService.update(id, dto, currentUser);
  }
}
