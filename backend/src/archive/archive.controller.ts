import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { ArchiveService } from './archive.service';

@UseGuards(JwtAuthGuard)
@Controller('archive')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get('submissions')
  listSubmissions(
    @CurrentUser() currentUser: CurrentUserType,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('taskId') taskId?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.archiveService.listSubmissions(currentUser, {
      classId,
      studentId,
      taskId,
      keyword,
    });
  }
}
