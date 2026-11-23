import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, SubmissionStatus, TaskStatus } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { AiReviewService } from '../ai-review/ai-review.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  extractOcrHeaderName,
  rankStudentCandidates,
} from '../text-extraction/ocr-student-match';
import { TextExtractionService } from '../text-extraction/text-extraction.service';
import { PaddleOcrCheckpoint } from '../text-extraction/paddle-ocr.service';
import { OcrRetryableError } from '../text-extraction/ocr-retryable.error';

type JobItem =
  | {
      kind: 'ocr';
      submissionId: string;
    }
  | {
      kind: 'review';
      submissionId: string;
    };

type JobKind = JobItem['kind'];
type JobQueue = {
  pending: JobItem[];
  active: Set<string>;
  concurrency: number;
};

type StudentMatchSubmission = {
  id: string;
  classId: string | null;
  studentId: string | null;
  task: {
    classId: string;
    classes: Array<{ classId: string }>;
  };
};

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly queues: Record<JobKind, JobQueue> = {
    ocr: this.createQueue('OCR_CONCURRENCY'),
    review: this.createQueue('REVIEW_CONCURRENCY'),
  };
  private readonly delayedOcr = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly autoRetryLimit = this.retrySetting(
    'OCR_AUTO_RETRY_MAX_ATTEMPTS',
    10,
  );
  private readonly autoRetryBaseMs = this.retrySetting(
    'OCR_AUTO_RETRY_BASE_MS',
    60000,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiReviewService: AiReviewService,
    private readonly filesService: FilesService,
    private readonly textExtractionService: TextExtractionService,
  ) {}

  async onModuleInit() {
    const resumable = await this.prisma.submission.findMany({
      where: {
        deletedAt: null,
        task: { deletedAt: null },
        status: {
          in: [
            SubmissionStatus.TEXT_EXTRACTING,
            SubmissionStatus.TEXT_READY,
            SubmissionStatus.AI_PROCESSING,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        ocrNextRetryAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    for (const submission of resumable) {
      if (submission.status === SubmissionStatus.TEXT_EXTRACTING) {
        if (
          submission.ocrNextRetryAt &&
          submission.ocrNextRetryAt.getTime() > Date.now()
        ) {
          this.scheduleOcrRetry(submission.id, submission.ocrNextRetryAt);
        } else {
          this.enqueueSubmissionOcr(submission.id);
        }
      } else {
        this.enqueueSubmissionReview(submission.id);
      }
    }

    try {
      await this.bindPreviouslyUnboundStudents();
    } catch (error) {
      this.logger.warn(`已有作文学生匹配暂未完成: ${String(error)}`);
    }
  }

  enqueueSubmissionOcr(submissionId: string) {
    const timer = this.delayedOcr.get(submissionId);
    if (timer) clearTimeout(timer);
    this.delayedOcr.delete(submissionId);
    this.enqueue({
      kind: 'ocr',
      submissionId,
    });
  }

  onModuleDestroy() {
    for (const timer of this.delayedOcr.values()) clearTimeout(timer);
    this.delayedOcr.clear();
  }

  private retrySetting(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  private scheduleOcrRetry(submissionId: string, when: Date) {
    const previous = this.delayedOcr.get(submissionId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(
      () => {
        this.delayedOcr.delete(submissionId);
        this.enqueueSubmissionOcr(submissionId);
      },
      Math.max(0, when.getTime() - Date.now()),
    );
    timer.unref?.();
    this.delayedOcr.set(submissionId, timer);
  }

  enqueueSubmissionReview(submissionId: string) {
    this.enqueue({
      kind: 'review',
      submissionId,
    });
  }

  private enqueue(job: JobItem) {
    const queue = this.queues[job.kind];
    const jobKey = this.getJobKey(job);
    const queuedAlready = queue.pending.some(
      (queuedJob) => this.getJobKey(queuedJob) === jobKey,
    );

    if (queuedAlready || queue.active.has(jobKey)) {
      return;
    }

    queue.pending.push(job);
    this.kick(job.kind);
  }

  private kick(kind: JobKind) {
    const queue = this.queues[kind];
    while (queue.active.size < queue.concurrency && queue.pending.length > 0) {
      const job = queue.pending.shift();
      if (!job) {
        return;
      }

      const jobKey = this.getJobKey(job);
      queue.active.add(jobKey);
      void this.processJob(job)
        .catch((error: unknown) => {
          this.logger.error(`后台任务异常: ${jobKey}`, error);
        })
        .finally(() => {
          queue.active.delete(jobKey);
          this.kick(kind);
        });
    }
  }

  private createQueue(variable: string): JobQueue {
    const raw = process.env[variable];
    const value = raw?.trim() ? Number(raw) : 2;
    const valid = Number.isSafeInteger(value) && value > 0;
    if (!valid) {
      this.logger.warn(`${variable} 必须为正整数，使用默认并发数 2`);
    }
    return {
      pending: [],
      active: new Set<string>(),
      concurrency: valid ? value : 2,
    };
  }

  private async processJob(job: JobItem) {
    if (job.kind === 'ocr') {
      await this.processSubmissionOcr(job.submissionId);
      return;
    }

    await this.processSubmissionReview(job.submissionId);
  }

  private async processSubmissionOcr(submissionId: string) {
    let retryCount = 0;
    try {
      const submission = await this.prisma.submission.findFirst({
        where: { id: submissionId, deletedAt: null, task: { deletedAt: null } },
        include: {
          task: {
            select: {
              classId: true,
              classes: { select: { classId: true } },
            },
          },
          files: {
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
          text: true,
        },
      });

      const file = submission?.files[0];
      if (!submission || !file) {
        return;
      }
      if (
        submission.status &&
        submission.status !== SubmissionStatus.TEXT_EXTRACTING &&
        submission.status !== SubmissionStatus.UPLOADED
      )
        return;
      retryCount = submission.ocrRetryCount ?? 0;
      const progress = (submission.ocrProgress ?? {}) as unknown as Record<
        string,
        PaddleOcrCheckpoint
      >;

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.TEXT_EXTRACTING,
          ocrNextRetryAt: null,
        },
      });
      await this.refreshTaskStatus(submission.taskId);

      const absolutePath = this.filesService.toAbsolutePath(file.filePath);
      const buffer = await readFile(absolutePath);
      const extracted = await this.textExtractionService.extractText(
        {
          kind: file.fileType,
          buffer,
        },
        {
          waitForOcr: true,
          ocrProgress: progress,
          onOcrProgress: async (stage, checkpoint) => {
            progress[stage] = checkpoint;
            await this.prisma.submission.update({
              where: { id: submissionId },
              data: {
                ocrProgress: progress as unknown as Prisma.InputJsonValue,
              },
            });
          },
        },
      );

      await this.prisma.submissionText.upsert({
        where: { submissionId },
        create: {
          submissionId,
          ocrText: extracted.text || null,
          correctedText: null,
        },
        update: {
          ocrText: extracted.text || null,
        },
      });

      const ocrHeaderName =
        extracted.ocrHeaderName ??
        extractOcrHeaderName(extracted.ocrRawText ?? '');
      if (ocrHeaderName) {
        try {
          await this.bindTopStudentCandidate(submission, ocrHeaderName);
        } catch (error) {
          this.logger.warn(`OCR 姓名匹配失败，保留人工绑定: ${String(error)}`);
        }
      }

      const nextStatus =
        extracted.text.trim().length >= 20
          ? SubmissionStatus.TEXT_READY
          : SubmissionStatus.TEXT_PENDING_CORRECTION;

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: nextStatus,
          ocrHeaderName,
          ocrRetryCount: 0,
          ocrNextRetryAt: null,
          ocrLastError: null,
        },
      });

      if (nextStatus === SubmissionStatus.TEXT_READY) {
        this.enqueueSubmissionReview(submissionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof OcrRetryableError &&
        retryCount < this.autoRetryLimit
      ) {
        const delay = Math.min(
          this.autoRetryBaseMs * 2 ** Math.min(retryCount, 16),
          900000,
        );
        const when = new Date(Date.now() + delay);
        await this.prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.TEXT_EXTRACTING,
            ocrRetryCount: retryCount + 1,
            ocrNextRetryAt: when,
            ocrLastError: message,
          },
        });
        this.scheduleOcrRetry(submissionId, when);
        this.logger.warn(
          `OCR 暂停并等待续接: ${submissionId}；${Math.ceil(delay / 1000)} 秒后自动重试（${retryCount + 1}/${this.autoRetryLimit}）：${message}`,
        );
      } else {
        this.logger.error(`OCR 任务失败: ${submissionId}`, error);
        await this.prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.FAILED,
            ocrNextRetryAt: null,
            ocrLastError: message,
          },
        });
      }
    } finally {
      const submission = await this.prisma.submission.findFirst({
        where: { id: submissionId, deletedAt: null, task: { deletedAt: null } },
        select: { taskId: true },
      });
      if (submission) {
        await this.refreshTaskStatus(submission.taskId);
      }
    }
  }

  private async bindTopStudentCandidate(
    submission: StudentMatchSubmission,
    ocrName: string,
  ) {
    if (submission.studentId) return;

    const classIds = submission.task.classes.length
      ? submission.task.classes.map((item) => item.classId)
      : [submission.task.classId];
    if (!classIds.length) return;

    const students = await this.prisma.student.findMany({
      where: { classId: { in: classIds }, status: 'ACTIVE' },
      select: { id: true, name: true, classId: true },
    });
    const matched = rankStudentCandidates(ocrName, students, 1)[0]?.student;
    if (!matched) return;

    // OCR 期间老师可能已经手动绑定；只更新仍未绑定的作文。
    await this.prisma.submission.updateMany({
      where: {
        id: submission.id,
        studentId: null,
        classId: submission.classId,
        deletedAt: null,
      },
      data: { studentId: matched.id, classId: matched.classId },
    });
  }

  private async bindPreviouslyUnboundStudents() {
    let lastId: string | undefined;
    while (true) {
      const submissions = await this.prisma.submission.findMany({
        where: {
          ...(lastId ? { id: { gt: lastId } } : {}),
          deletedAt: null,
          task: { deletedAt: null },
          studentId: null,
          ocrHeaderName: { not: null },
          status: { not: SubmissionStatus.TEXT_EXTRACTING },
        },
        select: {
          id: true,
          studentId: true,
          classId: true,
          ocrHeaderName: true,
          task: {
            select: {
              classId: true,
              classes: { select: { classId: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 100,
      });
      if (!submissions.length) return;

      for (const submission of submissions) {
        if (!submission.ocrHeaderName) continue;
        try {
          await this.bindTopStudentCandidate(
            submission,
            submission.ocrHeaderName,
          );
        } catch (error) {
          this.logger.warn(
            `已有作文学生匹配失败: ${submission.id}, ${String(error)}`,
          );
        }
      }
      lastId = submissions[submissions.length - 1].id;
    }
  }

  private async processSubmissionReview(submissionId: string) {
    try {
      const submission = await this.prisma.submission.findFirst({
        where: { id: submissionId, deletedAt: null, task: { deletedAt: null } },
        include: {
          task: {
            include: {
              class: true,
            },
          },
          text: true,
          review: true,
          student: { include: { class: true } },
          class: true,
        },
      });

      if (!submission?.text) {
        return;
      }

      const essayText =
        submission.text.correctedText?.trim() ||
        submission.text.ocrText?.trim() ||
        '';

      if (!essayText) {
        await this.prisma.submission.update({
          where: { id: submissionId },
          data: { status: SubmissionStatus.TEXT_PENDING_CORRECTION },
        });
        await this.refreshTaskStatus(submission.taskId);
        return;
      }

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.AI_PROCESSING },
      });
      await this.refreshTaskStatus(submission.taskId);

      const review = await this.aiReviewService.generateEssayReview({
        taskTitle: submission.task.title,
        topicText: submission.task.topicText,
        topicGuidance: submission.task.topicGuidance as Record<
          string,
          unknown
        > | null,
        studentName: submission.student?.name,
        className:
          submission.student?.class.name ??
          submission.class?.name ??
          submission.task.class.name,
        essayText,
      });

      await this.prisma.review.upsert({
        where: { submissionId },
        create: {
          submissionId,
          aiSummary: review.summary,
          aiStrengths: review.strengths,
          aiIssues: review.issues,
          aiSuggestions: review.suggestions,
          aiRewriteExample: review.rewriteExample,
          scoreTotal: review.scoring.total,
          scoreContent: review.scoring.content,
          scoreStructure: review.scoring.structure,
          scoreLanguage: review.scoring.language,
          scoreIdea: review.scoring.idea,
          printableSnapshot: review,
        },
        update: {
          aiSummary: review.summary,
          aiStrengths: review.strengths,
          aiIssues: review.issues,
          aiSuggestions: review.suggestions,
          aiRewriteExample: review.rewriteExample,
          scoreTotal: review.scoring.total,
          scoreContent: review.scoring.content,
          scoreStructure: review.scoring.structure,
          scoreLanguage: review.scoring.language,
          scoreIdea: review.scoring.idea,
          printableSnapshot: review,
        },
      });

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.AI_DONE },
      });
    } catch (error) {
      this.logger.error(`批改任务失败: ${submissionId}`, error);
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.FAILED },
      });
    } finally {
      const submission = await this.prisma.submission.findFirst({
        where: { id: submissionId, deletedAt: null, task: { deletedAt: null } },
        select: { taskId: true },
      });
      if (submission) {
        await this.refreshTaskStatus(submission.taskId);
      }
    }
  }

  private getJobKey(job: JobItem) {
    return `${job.kind}:${job.submissionId}`;
  }

  private async refreshTaskStatus(taskId: string) {
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

    let status: TaskStatus = TaskStatus.CREATED;
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
