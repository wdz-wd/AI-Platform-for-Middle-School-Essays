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
        deletedAt: null,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.classId || query.keyword
          ? {
              AND: [
                ...(query.classId
                  ? [
                      {
                        OR: [
                          { classId: query.classId },
                          { student: { classId: query.classId } },
                          {
                            task: {
                              OR: [
                                { classId: query.classId },
                                { classes: { some: { classId: query.classId } } },
                              ],
                            },
                          },
                        ],
                      },
                    ]
                  : []),
                ...(query.keyword
                  ? [
                      {
                        OR: [
                          {
                            detectedName: {
                              contains: query.keyword,
                              mode: 'insensitive' as const,
                            },
                          },
                          {
                            review: {
                              finalComment: {
                                contains: query.keyword,
                                mode: 'insensitive' as const,
                              },
                            },
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            }
          : {}),
        task: {
          deletedAt: null,
          ...(currentUser.role === UserRole.ADMIN
            ? {}
            : { teacherId: currentUser.id }),
        },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            class: {
              select: { id: true, name: true, grade: true, academicYear: true },
            },
            classes: {
              include: {
                class: {
                  select: { id: true, name: true, grade: true, academicYear: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        class: {
          select: { id: true, name: true, grade: true, academicYear: true },
        },
        student: {
          select: {
            id: true,
            name: true,
            studentNo: true,
            class: {
              select: { id: true, name: true, grade: true, academicYear: true },
            },
          },
        },
        review: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
