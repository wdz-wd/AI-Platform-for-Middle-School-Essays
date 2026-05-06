import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { EssayTasksService } from './essay-tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class EssayTasksController {
  constructor(private readonly essayTasksService: EssayTasksService) {}

  @Get()
  list(@CurrentUser() currentUser: CurrentUserType) {
    return this.essayTasksService.list(currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.essayTasksService.create(dto, currentUser);
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.essayTasksService.getById(id, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.essayTasksService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.essayTasksService.remove(id, currentUser);
  }

  @Post(':id/topic-files')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadTopicFile(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Body('topicText') topicText: string | undefined,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.essayTasksService.uploadTopicFile(id, file, topicText, currentUser);
  }

  @Post(':id/submissions/upload')
  @UseInterceptors(FilesInterceptor('files', 60, { storage: memoryStorage() }))
  uploadSubmissions(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.essayTasksService.uploadSubmissions(id, files, currentUser);
  }
}
