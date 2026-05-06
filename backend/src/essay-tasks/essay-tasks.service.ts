import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FileKind,
  SubmissionStatus,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import path from 'node:path';
import type { Express } from 'express';
import type { CurrentUserType } from '../common/types/current-user.type';
import { getCurrentAcademicYear } from '../common/utils/academic-year.util';
import { AiReviewService } from '../ai-review/ai-review.service';
import { FilesService } from '../files/files.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { TextExtractionService } from '../text-extraction/text-extraction.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

type TaskWithClassLinks = {
  class: { id: string; name: string; grade?: string | null };
  classes?: Array<{
    class: { id: string; name: string; grade?: string | null };
  }>;
};

@Injectable()
export class EssayTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly textExtractionService: TextExtractionService,
    private readonly jobsService: JobsService,
    private readonly aiReviewService: AiReviewService,
  ) {}

  async create(dto: CreateTaskDto, currentUser: CurrentUserType) {
    const classIds = this.normalizeClassIds(
      dto.classIds ?? [dto.classId].filter(Boolean),
    );
    const classes = await this.getWritableClassesOrThrow(classIds, currentUser);
    const primaryClass = classes[0];

    const guidance = dto.topicText?.trim()
      ? await this.aiReviewService.generateTopicGuidance({
          taskName: dto.title,
          topicText: dto.topicText.trim(),
        })
      : null;

    const task = await this.prisma.essayTask.create({
      data: {
        classId: primaryClass.id,
        teacherId: currentUser.id,
        title: dto.title,
        note: dto.note,
        topicText: dto.topicText?.trim() || null,
        topicGuidance: guidance ?? undefined,
        classes: {
          create: classIds.map((classId) => ({ classId })),
        },
      },
      include: this.taskListInclude(),
    });

    return this.withTaskClasses(task);
  }

  async list(currentUser: CurrentUserType) {
    const tasks = await this.prisma.essayTask.findMany({
      where:
        currentUser.role === UserRole.ADMIN
          ? { deletedAt: null }
          : { deletedAt: null, teacherId: currentUser.id },
      orderBy: { createdAt: 'desc' },
      include: this.taskListInclude(),
    });

    return tasks.map((task) => this.withTaskClasses(task));
  }

  async getById(id: string, currentUser: CurrentUserType) {
    const task = await this.prisma.essayTask.findFirst({
      where: { id, deletedAt: null },
      include: {
        class: {
          select: { id: true, name: true, grade: true },
        },
        classes: {
          include: {
            class: {
              select: { id: true, name: true, grade: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        teacher: {
          select: { id: true, displayName: true, username: true },
        },
        topicFiles: true,
        submissions: {
          where: { deletedAt: null },
          include: {
            class: {
              select: { id: true, name: true, grade: true },
            },
            student: {
              select: { id: true, name: true, studentNo: true, classId: true },
            },
            text: true,
            review: true,
            files: true,
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
      throw new ForbiddenException('无权访问该任务');
    }

    return {
      ...this.withTaskClasses(task),
      topicFiles: task.topicFiles.map((file) => ({
        ...file,
        publicUrl: this.filesService.toPublicUrl(file.filePath),
      })),
      submissions: task.submissions.map((submission) => ({
        ...submission,
        files: submission.files.map((file) => ({
          ...file,
          publicUrl: this.filesService.toPublicUrl(file.filePath),
        })),
      })),
    };
  }

  async update(id: string, dto: UpdateTaskDto, currentUser: CurrentUserType) {
    await this.getTaskOrThrow(id, currentUser);
    const task = await this.prisma.essayTask.update({
      where: { id },
      data: {
        ...(dto.title?.trim() ? { title: dto.title.trim() } : {}),
      },
      include: this.taskListInclude(),
    });

    return this.withTaskClasses(task);
  }

  async remove(id: string, currentUser: CurrentUserType) {
    const task = await this.getTaskOrThrow(id, currentUser);
    const deletedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.submission.updateMany({
        where: { taskId: task.id, deletedAt: null },
        data: { deletedAt },
      }),
      this.prisma.essayTask.update({
        where: { id: task.id },
        data: { deletedAt },
      }),
    ]);

    return { deleted: true };
  }

  async uploadTopicFile(
    taskId: string,
    file: Express.Multer.File,
    topicText: string | undefined,
    currentUser: CurrentUserType,
  ) {
    const task = await this.getTaskOrThrow(taskId, currentUser);
    if (!file) {
      throw new BadRequestException('请上传作文题文件');
    }

    const storedFile = await this.filesService.storeTaskTopicFile(taskId, file);
    let extracted = {
      text: '',
      requiresManualCorrection: false,
      requiresOcrPolling: false,
      source: 'MANUAL_INPUT',
    };

    try {
      extracted = await this.textExtractionService.extractText(
        {
          kind: storedFile.fileType,
          buffer: file.buffer,
        },
        { waitForOcr: true },
      );
    } catch (error) {
      if (!topicText?.trim()) {
        throw error;
      }
    }

    const mergedTopicText = topicText?.trim() || extracted.text || null;
    const guidance = mergedTopicText
      ? await this.aiReviewService.generateTopicGuidance({
          taskName: task.title,
          topicText: mergedTopicText,
        })
      : null;

    const [topicFile] = await this.prisma.$transaction([
      this.prisma.essayTopicFile.create({
        data: {
          taskId,
          filePath: storedFile.filePath,
          fileName: storedFile.fileName,
          fileType: storedFile.fileType,
          extractedText: extracted.text || null,
        },
      }),
      this.prisma.essayTask.update({
        where: { id: taskId },
        data: {
          topicText: mergedTopicText,
          topicGuidance: guidance ?? undefined,
        },
      }),
    ]);

    return {
      ...topicFile,
      publicUrl: storedFile.publicUrl,
    };
  }

  async uploadSubmissions(
    taskId: string,
    files: Express.Multer.File[],
    currentUser: CurrentUserType,
  ) {
    await this.getTaskOrThrow(taskId, currentUser);

    if (!files?.length) {
      throw new BadRequestException('请上传学生作文文件');
    }

    const createdIds: string[] = [];

    for (const file of files) {
      const storedFile = await this.filesService.storeSubmissionFile(taskId, file);
      const extracted = await this.textExtractionService.extractText({
        kind: storedFile.fileType,
        buffer: file.buffer,
      });
      const initialStatus = extracted.requiresOcrPolling
        ? SubmissionStatus.TEXT_EXTRACTING
        : extracted.requiresManualCorrection
          ? SubmissionStatus.TEXT_PENDING_CORRECTION
          : SubmissionStatus.TEXT_READY;
      const detectedName = path.parse(storedFile.fileName).name;

      const created = await this.prisma.submission.create({
        data: {
          taskId,
          detectedName,
          status: initialStatus,
          files: {
            create: {
              filePath: storedFile.filePath,
              fileName: storedFile.fileName,
              fileType: storedFile.fileType,
            },
          },
          text: {
            create: {
              ocrText: extracted.text || null,
              correctedText:
                extracted.requiresManualCorrection || extracted.requiresOcrPolling
                  ? null
                  : extracted.text || null,
            },
          },
        },
      });

      createdIds.push(created.id);

      if (initialStatus === SubmissionStatus.TEXT_EXTRACTING) {
        this.jobsService.enqueueSubmissionOcr(created.id);
      } else if (initialStatus === SubmissionStatus.TEXT_READY) {
        this.jobsService.enqueueSubmissionReview(created.id);
      }
    }

    await this.refreshTaskCounters(taskId);
    return this.getById(taskId, currentUser);
  }

  private async getTaskOrThrow(taskId: string, currentUser: CurrentUserType) {
    const task = await this.prisma.essayTask.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      task.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('无权访问该任务');
    }

    return task;
  }

  private normalizeClassIds(classIds: Array<string | undefined>) {
    const normalized = Array.from(
      new Set(classIds.map((item) => item?.trim()).filter(Boolean)),
    ) as string[];

    if (!normalized.length) {
      throw new BadRequestException('请选择至少一个班级');
    }

    return normalized;
  }

  private async getWritableClassesOrThrow(
    classIds: string[],
    currentUser: CurrentUserType,
  ) {
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds } },
      orderBy: { createdAt: 'asc' },
    });

    if (classes.length !== classIds.length) {
      throw new NotFoundException('班级不存在');
    }

    const forbidden = classes.some(
      (item) =>
        currentUser.role !== UserRole.ADMIN && item.teacherId !== currentUser.id,
    );

    if (forbidden) {
      throw new ForbiddenException('无权在所选班级创建任务');
    }

    const currentAcademicYear = getCurrentAcademicYear();
    const hasHistoricalClass = classes.some(
      (item) => item.academicYear !== currentAcademicYear,
    );

    if (hasHistoricalClass) {
      throw new BadRequestException(
        `只能在当前学年（${currentAcademicYear}）的班级创建任务`,
      );
    }

    return classIds.map((classId) => classes.find((item) => item.id === classId)!);
  }

  private taskListInclude() {
    return {
      class: {
        select: { id: true, name: true, grade: true },
      },
      classes: {
        include: {
          class: {
            select: { id: true, name: true, grade: true },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  private withTaskClasses<T extends TaskWithClassLinks>(task: T) {
    const classes = task.classes?.map((item) => item.class) ?? [];
    return {
      ...task,
      classes: classes.length ? classes : [task.class].filter(Boolean),
    };
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
    const doneCount = task.submissions.filter((item) =>
      doneStatuses.includes(item.status),
    ).length;
    const failedCount = task.submissions.filter(
      (item) => item.status === SubmissionStatus.FAILED,
    ).length;

    await this.prisma.essayTask.update({
      where: { id: taskId },
      data: {
        totalCount,
        doneCount,
        failedCount,
        status: totalCount === 0 ? TaskStatus.CREATED : TaskStatus.PROCESSING,
      },
    });
  }
}
