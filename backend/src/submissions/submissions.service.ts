import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubmissionStatus, UserRole } from '@prisma/client';
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
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        task: {
          include: {
            class: true,
            submissions: {
              select: { id: true, detectedName: true, status: true },
              orderBy: { createdAt: 'asc' },
            },
          },
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
    return this.prisma.submission.update({
      where: { id },
      data: {
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
}
