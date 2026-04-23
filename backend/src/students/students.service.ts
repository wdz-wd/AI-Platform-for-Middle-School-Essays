import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { CurrentUserType } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryStudentsDto, currentUser: CurrentUserType) {
    const where =
      currentUser.role === UserRole.ADMIN
        ? {
            ...(query.classId ? { classId: query.classId } : {}),
          }
        : {
            ...(query.classId ? { classId: query.classId } : {}),
            class: { teacherId: currentUser.id },
          };

    return this.prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        class: {
          select: { id: true, name: true, grade: true },
        },
      },
    });
  }

  async create(dto: CreateStudentDto, currentUser: CurrentUserType) {
    await this.assertClassWritable(dto.classId, currentUser);
    return this.prisma.student.create({
      data: dto,
      include: {
        class: {
          select: { id: true, name: true, grade: true },
        },
      },
    });
  }

  async update(id: string, dto: UpdateStudentDto, currentUser: CurrentUserType) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { class: true },
    });

    if (!student) {
      throw new NotFoundException('学生不存在');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      student.class.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('无权修改该学生');
    }

    if (dto.classId) {
      await this.assertClassWritable(dto.classId, currentUser);
    }

    return this.prisma.student.update({
      where: { id },
      data: dto,
      include: {
        class: {
          select: { id: true, name: true, grade: true },
        },
      },
    });
  }

  private async assertClassWritable(
    classId: string,
    currentUser: CurrentUserType,
  ) {
    const classEntity = await this.prisma.class.findUnique({ where: { id: classId } });

    if (!classEntity) {
      throw new NotFoundException('班级不存在');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      classEntity.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('无权操作该班级学生');
    }
  }
}
