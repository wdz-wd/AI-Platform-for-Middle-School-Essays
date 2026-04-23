import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SubmissionStatus, TaskStatus } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { AiReviewService } from '../ai-review/ai-review.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { TextExtractionService } from '../text-extraction/text-extraction.service';

type JobItem =
  | {
      kind: 'ocr';
      submissionId: string;
    }
  | {
      kind: 'review';
      submissionId: string;
    };

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly queue: JobItem[] = [];
  private readonly active = new Set<string>();
  private readonly concurrency = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiReviewService: AiReviewService,
    private readonly filesService: FilesService,
    private readonly textExtractionService: TextExtractionService,
  ) {}

  async onModuleInit() {
    const resumable = await this.prisma.submission.findMany({
      where: {
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
      },
    });

    for (const submission of resumable) {
      if (submission.status === SubmissionStatus.TEXT_EXTRACTING) {
        this.enqueueSubmissionOcr(submission.id);
      } else {
        this.enqueueSubmissionReview(submission.id);
      }
    }
  }

  enqueueSubmissionOcr(submissionId: string) {
    this.enqueue({
      kind: 'ocr',
      submissionId,
    });
  }

  enqueueSubmissionReview(submissionId: string) {
    this.enqueue({
      kind: 'review',
      submissionId,
    });
  }

  private enqueue(job: JobItem) {
    const jobKey = this.getJobKey(job);
    const queuedAlready = this.queue.some(
      (queuedJob) => this.getJobKey(queuedJob) === jobKey,
    );

    if (queuedAlready || this.active.has(jobKey)) {
      return;
    }

    this.queue.push(job);
    void this.kick();
  }

  private async kick() {
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        return;
      }

      const jobKey = this.getJobKey(job);
      this.active.add(jobKey);
      void this.processJob(job).finally(() => {
        this.active.delete(jobKey);
        void this.kick();
      });
    }
  }

  private async processJob(job: JobItem) {
    if (job.kind === 'ocr') {
      await this.processSubmissionOcr(job.submissionId);
      return;
    }

    await this.processSubmissionReview(job.submissionId);
  }

  private async processSubmissionOcr(submissionId: string) {
    try {
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
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

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.TEXT_EXTRACTING },
      });
      await this.refreshTaskStatus(submission.taskId);

      const absolutePath = this.filesService.toAbsolutePath(file.filePath);
      const buffer = await readFile(absolutePath);
      const extracted = await this.textExtractionService.extractText(
        {
          kind: file.fileType,
          buffer,
        },
        { waitForOcr: true },
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
          correctedText: {
            set:
              submission.text?.correctedText && submission.text.correctedText.trim()
                ? submission.text.correctedText
                : null,
          },
        },
      });

      const nextStatus =
        extracted.text.trim().length >= 20
          ? SubmissionStatus.TEXT_READY
          : SubmissionStatus.TEXT_PENDING_CORRECTION;

      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: nextStatus },
      });

      if (nextStatus === SubmissionStatus.TEXT_READY) {
        this.enqueueSubmissionReview(submissionId);
      }
    } catch (error) {
      this.logger.error(`OCR 任务失败: ${submissionId}`, error);
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.FAILED },
      });
    } finally {
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        select: { taskId: true },
      });
      if (submission) {
        await this.refreshTaskStatus(submission.taskId);
      }
    }
  }

  private async processSubmissionReview(submissionId: string) {
    try {
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          task: {
            include: {
              class: true,
            },
          },
          text: true,
          review: true,
          student: true,
        },
      });

      if (!submission?.text) {
        return;
      }

      const essayText =
        submission.text.correctedText?.trim() || submission.text.ocrText?.trim() || '';

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
        studentName: submission.student?.name ?? submission.detectedName,
        className: submission.task.class.name,
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
          printableSnapshot: review as unknown as object,
        },
        update: {
          aiSummary: review.summary,
          aiStrengths: review.strengths,
          aiIssues: review.issues,
          aiSuggestions: review.suggestions,
          aiRewriteExample: review.rewriteExample,
          printableSnapshot: review as unknown as object,
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
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
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
    const task = await this.prisma.essayTask.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
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
