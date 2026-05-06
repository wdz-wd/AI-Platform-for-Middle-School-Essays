import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubmissionStatus, TaskStatus, UserRole } from '@prisma/client';
import type { CurrentUserType } from '../common/types/current-user.type';
import { FilesService } from '../files/files.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { BindStudentDto } from './dto/bind-student.dto';
import { UpdateSubmissionTextDto } from './dto/update-submission-text.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly jobsService: JobsService,
  ) {}

  async getById(id: string, currentUser: CurrentUserType) {
    const submission = await this.prisma.submission.findFirst({
      where: { id, deletedAt: null, task: { deletedAt: null } },
      include: {
        task: {
          include: {
            class: true,
            classes: {
              include: {
                class: {
                  select: { id: true, name: true, grade: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            submissions: {
              where: { deletedAt: null },
              select: { id: true, detectedName: true, status: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        class: {
          select: { id: true, name: true, grade: true },
        },
        student: true,
        files: true,
        text: true,
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
      throw new ForbiddenException('无权访问该作文');
    }

    return {
      ...submission,
      task: {
        ...submission.task,
        classes:
          submission.task.classes.length > 0
            ? submission.task.classes.map((item) => item.class)
            : [submission.task.class],
      },
      files: submission.files.map((file) => ({
        ...file,
        publicUrl: this.filesService.toPublicUrl(file.filePath),
      })),
    };
  }

  async bindStudent(
    id: string,
    dto: BindStudentDto,
    currentUser: CurrentUserType,
  ) {
    const submission = await this.getById(id, currentUser);
    const taskClassIds = submission.task.classes.map((item) => item.id);
    let nextClassId = dto.classId?.trim() || null;

    if (dto.studentId) {
      const student = await this.prisma.student.findUnique({
        where: { id: dto.studentId },
      });

      if (!student) {
        throw new NotFoundException('学生不存在');
      }

      nextClassId = student.classId;
    }

    if (nextClassId && !taskClassIds.includes(nextClassId)) {
      throw new ForbiddenException('所选班级不属于该作文任务');
    }

    return this.prisma.submission.update({
      where: { id },
      data: {
        classId: nextClassId,
        studentId: dto.studentId ?? null,
      },
    });
  }

  async updateText(
    id: string,
    dto: UpdateSubmissionTextDto,
    currentUser: CurrentUserType,
  ) {
    const submission = await this.getById(id, currentUser);
    await this.prisma.submissionText.upsert({
      where: { submissionId: id },
      create: {
        submissionId: id,
        correctedText: dto.text,
        ocrText: submission.text?.ocrText ?? null,
      },
      update: {
        correctedText: dto.text,
        textVersion: {
          increment: 1,
        },
      },
    });

    return this.prisma.submission.update({
      where: { id },
      data: {
        status: SubmissionStatus.TEXT_READY,
      },
    });
  }

  async triggerReview(id: string, currentUser: CurrentUserType) {
    const submission = await this.getById(id, currentUser);
    if (submission.status === SubmissionStatus.TEXT_EXTRACTING) {
      throw new BadRequestException('系统正在进行 OCR 识别，请稍后再试');
    }

    if (
      !submission.text?.correctedText?.trim() &&
      !submission.text?.ocrText?.trim()
    ) {
      throw new NotFoundException('请先补录或修正文稿');
    }

    await this.prisma.submission.update({
      where: { id },
      data: {
        status: SubmissionStatus.TEXT_READY,
      },
    });

    this.jobsService.enqueueSubmissionReview(id);
    return { queued: true };
  }

  async remove(id: string, currentUser: CurrentUserType) {
    const submission = await this.getById(id, currentUser);

    await this.prisma.submission.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.refreshTaskCounters(submission.taskId);

    return { deleted: true };
  }

  private async refreshTaskCounters(taskId: string) {
    const task = await this.prisma.essayTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        submissions: {
          where: { deletedAt: null },
          select: { status: true },
        },
      },
    });

    if (!task) {
      return;
    }

    const totalCount = task.submissions.length;
    const doneStatuses: SubmissionStatus[] = [
      SubmissionStatus.AI_DONE,
      SubmissionStatus.REVIEWED,
    ];
    const activeStatuses: SubmissionStatus[] = [
      SubmissionStatus.UPLOADED,
      SubmissionStatus.TEXT_EXTRACTING,
      SubmissionStatus.TEXT_READY,
      SubmissionStatus.AI_PROCESSING,
    ];
    const doneCount = task.submissions.filter((item) =>
      doneStatuses.includes(item.status),
    ).length;
    const failedCount = task.submissions.filter(
      (item) => item.status === SubmissionStatus.FAILED,
    ).length;
    const activeCount = task.submissions.filter((item) =>
      activeStatuses.includes(item.status),
    ).length;

    let status: TaskStatus;
    if (totalCount === 0) {
      status = TaskStatus.CREATED;
    } else if (doneCount === totalCount) {
      status = failedCount > 0 ? TaskStatus.PARTIAL_DONE : TaskStatus.DONE;
    } else if (doneCount > 0 || failedCount > 0) {
      status = TaskStatus.PARTIAL_DONE;
    } else if (activeCount > 0) {
      status = TaskStatus.PROCESSING;
    } else if (failedCount === totalCount) {
      status = TaskStatus.FAILED;
    } else {
      status = TaskStatus.PROCESSING;
    }

    await this.prisma.essayTask.update({
      where: { id: taskId },
      data: {
        totalCount,
        doneCount,
        failedCount,
        status,
      },
    });
  }
}
