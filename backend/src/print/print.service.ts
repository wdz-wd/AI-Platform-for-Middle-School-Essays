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
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, deletedAt: null, task: { deletedAt: null } },
      include: {
        task: {
          include: {
            class: true,
            classes: {
              include: { class: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        class: true,
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
      className:
        submission.class?.name ??
        submission.task.classes[0]?.class.name ??
        submission.task.class.name,
      taskTitle: submission.task.title,
      topicText: submission.task.topicText,
      finalComment:
        submission.review?.finalComment ??
        submission.review?.teacherComment ??
        submission.review?.aiSummary ??
        '',
      teacherFinalComment:
        submission.review?.finalComment ?? submission.review?.teacherComment ?? '',
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
    const task = await this.prisma.essayTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        class: true,
        classes: {
          include: { class: true },
          orderBy: { createdAt: 'asc' },
        },
        submissions: {
          where: { deletedAt: null },
          include: {
            class: true,
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
      className:
        task.classes.map((item) => item.class.name).join('、') || task.class.name,
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
        teacherFinalComment:
          submission.review?.finalComment ?? submission.review?.teacherComment ?? '',
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
