import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { CurrentUserType } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrintService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubmissionPrint(submissionId: string, currentUser: CurrentUserType) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        task: {
          include: {
            class: true,
          },
        },
        student: true,
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
      throw new ForbiddenException('无权打印该作文');
    }

    return {
      submissionId: submission.id,
      studentName: submission.student?.name ?? submission.detectedName ?? '未识别',
      className: submission.task.class.name,
      taskTitle: submission.task.title,
      topicText: submission.task.topicText,
      finalComment:
        submission.review?.finalComment ??
        submission.review?.teacherComment ??
        submission.review?.aiSummary ??
        '',
      score: {
        total: submission.review?.scoreTotal ?? null,
        content: submission.review?.scoreContent ?? null,
        structure: submission.review?.scoreStructure ?? null,
        language: submission.review?.scoreLanguage ?? null,
        idea: submission.review?.scoreIdea ?? null,
      },
      sections: {
        summary: submission.review?.aiSummary ?? '',
        strengths: submission.review?.aiStrengths ?? '',
        issues: submission.review?.aiIssues ?? '',
        suggestions: submission.review?.aiSuggestions ?? '',
        rewriteExample: submission.review?.aiRewriteExample ?? '',
      },
    };
  }

  async getTaskPrint(taskId: string, currentUser: CurrentUserType) {
    const task = await this.prisma.essayTask.findUnique({
      where: { id: taskId },
      include: {
        class: true,
        submissions: {
          include: {
            student: true,
            review: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      task.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('无权打印该任务');
    }

    return {
      taskId: task.id,
      taskTitle: task.title,
      className: task.class.name,
      items: task.submissions.map((submission) => ({
        submissionId: submission.id,
        studentName:
          submission.student?.name ?? submission.detectedName ?? '未识别',
        score: {
          total: submission.review?.scoreTotal ?? null,
          content: submission.review?.scoreContent ?? null,
          structure: submission.review?.scoreStructure ?? null,
          language: submission.review?.scoreLanguage ?? null,
          idea: submission.review?.scoreIdea ?? null,
        },
        finalComment:
          submission.review?.finalComment ??
          submission.review?.teacherComment ??
          submission.review?.aiSummary ??
          '',
        sections: {
          summary: submission.review?.aiSummary ?? '',
          strengths: submission.review?.aiStrengths ?? '',
          issues: submission.review?.aiIssues ?? '',
          suggestions: submission.review?.aiSuggestions ?? '',
          rewriteExample: submission.review?.aiRewriteExample ?? '',
        },
      })),
    };
  }
}
