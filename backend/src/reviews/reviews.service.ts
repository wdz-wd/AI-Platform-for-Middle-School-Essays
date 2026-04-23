import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubmissionStatus, UserRole } from '@prisma/client';
import type { CurrentUserType } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateReview(
    submissionId: string,
    dto: UpdateReviewDto,
    currentUser: CurrentUserType,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        task: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('作文不存在');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      submission.task.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('无权修改评语');
    }

    const review = await this.prisma.review.upsert({
      where: { submissionId },
      create: {
        submissionId,
        teacherComment: dto.teacherComment,
        finalComment: dto.finalComment,
      },
      update: {
        teacherComment: dto.teacherComment,
        finalComment: dto.finalComment,
      },
    });

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.REVIEWED,
        reviewedAt: new Date(),
      },
    });

    return review;
  }
}
