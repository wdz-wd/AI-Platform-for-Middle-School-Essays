import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubmissionStatus, UserRole } from '@prisma/client';
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
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, deletedAt: null, task: { deletedAt: null } },
      include: {
        task: true,
        review: true,
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

    const reviewCreate: Prisma.ReviewUncheckedCreateInput = { submissionId };
    const reviewUpdate: Prisma.ReviewUpdateInput = {};

    this.assignIfProvided(reviewCreate, reviewUpdate, 'teacherComment', dto.teacherComment);
    this.assignIfProvided(reviewCreate, reviewUpdate, 'finalComment', dto.finalComment);
    this.assignIfProvided(reviewCreate, reviewUpdate, 'aiSummary', dto.aiSummary);
    this.assignIfProvided(reviewCreate, reviewUpdate, 'aiStrengths', dto.aiStrengths);
    this.assignIfProvided(reviewCreate, reviewUpdate, 'aiIssues', dto.aiIssues);
    this.assignIfProvided(reviewCreate, reviewUpdate, 'aiSuggestions', dto.aiSuggestions);
    this.assignIfProvided(
      reviewCreate,
      reviewUpdate,
      'aiRewriteExample',
      dto.aiRewriteExample,
    );

    const nextScores = {
      content: dto.scoreContent ?? submission.review?.scoreContent ?? null,
      structure: dto.scoreStructure ?? submission.review?.scoreStructure ?? null,
      language: dto.scoreLanguage ?? submission.review?.scoreLanguage ?? null,
      idea: dto.scoreIdea ?? submission.review?.scoreIdea ?? null,
    };
    const hasScoreUpdate =
      dto.scoreContent !== undefined ||
      dto.scoreStructure !== undefined ||
      dto.scoreLanguage !== undefined ||
      dto.scoreIdea !== undefined;

    if (hasScoreUpdate) {
      reviewCreate.scoreContent = nextScores.content;
      reviewCreate.scoreStructure = nextScores.structure;
      reviewCreate.scoreLanguage = nextScores.language;
      reviewCreate.scoreIdea = nextScores.idea;
      reviewUpdate.scoreContent = nextScores.content;
      reviewUpdate.scoreStructure = nextScores.structure;
      reviewUpdate.scoreLanguage = nextScores.language;
      reviewUpdate.scoreIdea = nextScores.idea;

      if (
        nextScores.content != null &&
        nextScores.structure != null &&
        nextScores.language != null &&
        nextScores.idea != null
      ) {
        const total =
          nextScores.content +
          nextScores.structure +
          nextScores.language +
          nextScores.idea;
        reviewCreate.scoreTotal = total;
        reviewUpdate.scoreTotal = total;
      }
    }

    const review = await this.prisma.review.upsert({
      where: { submissionId },
      create: reviewCreate,
      update: reviewUpdate,
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

  private assignIfProvided<
    Key extends keyof Prisma.ReviewUncheckedCreateInput &
      keyof Prisma.ReviewUpdateInput,
  >(
    create: Prisma.ReviewUncheckedCreateInput,
    update: Prisma.ReviewUpdateInput,
    key: Key,
    value: Prisma.ReviewUncheckedCreateInput[Key] | undefined,
  ) {
    if (value !== undefined) {
      create[key] = value;
      update[key] = value;
    }
  }
}
