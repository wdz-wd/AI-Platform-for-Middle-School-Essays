import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { PrintService } from './print.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('reviews/:submissionId/print')
  getSubmissionPrint(
    @Param('submissionId') submissionId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.printService.getSubmissionPrint(submissionId, currentUser);
  }

  @Get('tasks/:id/print')
  getTaskPrint(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.printService.getTaskPrint(id, currentUser);
  }
}
