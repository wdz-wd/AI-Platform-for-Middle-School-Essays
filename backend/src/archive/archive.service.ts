import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { CurrentUserType } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  listSubmissions(
    currentUser: CurrentUserType,
    query: {
      classId?: string;
      studentId?: string;
      taskId?: string;
      keyword?: string;
    },
  ) {
    return this.prisma.submission.findMany({
      where: {
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.keyword
          ? {
              OR: [
                { detectedName: { contains: query.keyword, mode: 'insensitive' } },
                {
                  review: {
                    finalComment: {
                      contains: query.keyword,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
        task: {
          ...(query.classId ? { classId: query.classId } : {}),
          ...(currentUser.role === UserRole.ADMIN
            ? {}
            : { teacherId: currentUser.id }),
        },
      },
      include: {
        task: {
          select: { id: true, title: true },
        },
        student: {
          select: { id: true, name: true, studentNo: true },
        },
        review: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
