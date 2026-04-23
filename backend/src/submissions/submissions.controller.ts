import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { BindStudentDto } from './dto/bind-student.dto';
import { UpdateSubmissionTextDto } from './dto/update-submission-text.dto';
import { SubmissionsService } from './submissions.service';

@UseGuards(JwtAuthGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get(':id')
  getById(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.submissionsService.getById(id, currentUser);
  }

  @Patch(':id/student-binding')
  bindStudent(
    @Param('id') id: string,
    @Body() dto: BindStudentDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.submissionsService.bindStudent(id, dto, currentUser);
  }

  @Patch(':id/text')
  updateText(
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionTextDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.submissionsService.updateText(id, dto, currentUser);
  }

  @Post(':id/review')
  triggerReview(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.submissionsService.triggerReview(id, currentUser);
  }
}
