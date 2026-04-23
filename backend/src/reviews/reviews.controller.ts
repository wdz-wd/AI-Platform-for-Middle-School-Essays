import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { CurrentUserType } from '../common/types/current-user.type';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':submissionId')
  updateReview(
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    return this.reviewsService.updateReview(submissionId, dto, currentUser);
  }
}
