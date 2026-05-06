import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importFromTemplate(
    @Body('classId') classId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.studentsService.importFromTemplate(classId, file, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.studentsService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.studentsService.remove(id, currentUser);
  }
}
