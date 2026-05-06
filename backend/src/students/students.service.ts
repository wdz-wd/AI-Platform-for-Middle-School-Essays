import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Workbook } from 'exceljs';
import type { CurrentUserType } from '../common/types/current-user.type';
import { getCurrentAcademicYear } from '../common/utils/academic-year.util';
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
      data: {
        classId: dto.classId,
        name: dto.name,
        studentNo: this.optionalText(dto.studentNo),
        gender: this.optionalText(dto.gender),
      },
      include: {
        class: {
          select: { id: true, name: true, grade: true },
        },
      },
    });
  }

  async update(id: string, dto: UpdateStudentDto, currentUser: CurrentUserType) {
    await this.assertStudentWritable(id, currentUser);

    if (dto.classId) {
      await this.assertClassWritable(dto.classId, currentUser);
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.studentNo !== undefined
          ? { studentNo: this.optionalText(dto.studentNo) }
          : {}),
        ...(dto.gender !== undefined
          ? { gender: this.optionalText(dto.gender) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        class: {
          select: { id: true, name: true, grade: true },
        },
      },
    });
  }

  async importFromTemplate(
    classId: string,
    file: Express.Multer.File,
    currentUser: CurrentUserType,
  ) {
    if (!classId) {
      throw new BadRequestException('请先选择班级');
    }

    await this.assertClassWritable(classId, currentUser);
    const names = await this.extractStudentNames(file.buffer);

    if (!names.length) {
      throw new BadRequestException('模板中没有识别到学生姓名');
    }

    const existingStudents = await this.prisma.student.findMany({
      where: { classId, name: { in: names } },
      select: { name: true },
    });
    const existingNames = new Set(existingStudents.map((item) => item.name));
    const namesToCreate = names.filter((name) => !existingNames.has(name));

    if (namesToCreate.length) {
      await this.prisma.student.createMany({
        data: namesToCreate.map((name) => ({
          classId,
          name,
          studentNo: null,
          gender: null,
        })),
      });
    }

    return {
      total: names.length,
      created: namesToCreate.length,
      skipped: names.length - namesToCreate.length,
    };
  }

  async remove(id: string, currentUser: CurrentUserType) {
    const student = await this.assertStudentWritable(id, currentUser);

    await this.prisma.$transaction([
      this.prisma.submission.updateMany({
        where: { studentId: student.id },
        data: { studentId: null },
      }),
      this.prisma.student.delete({
        where: { id: student.id },
      }),
    ]);

    return { deleted: true };
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

    const currentAcademicYear = getCurrentAcademicYear();
    if (classEntity.academicYear !== currentAcademicYear) {
      throw new ForbiddenException(
        `只能在当前学年（${currentAcademicYear}）的班级中添加或调整学生`,
      );
    }
  }

  private async assertStudentWritable(
    id: string,
    currentUser: CurrentUserType,
  ) {
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

    return student;
  }

  private optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async extractStudentNames(buffer: Buffer) {
    let rows: unknown[][];

    try {
      const workbook = new Workbook();
      const data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
      await workbook.xlsx.load(data as unknown as ArrayBuffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        throw new BadRequestException('模板中没有可读取的工作表');
      }

      rows = [];
      worksheet.eachRow((row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        if (values.some((cell) => String(cell ?? '').trim())) {
          rows.push(values);
        }
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('无法读取学生名单模板，请上传 xlsx 文件');
    }

    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => String(cell ?? '').trim().includes('姓名')),
    );

    if (headerRowIndex < 0) {
      throw new BadRequestException('模板中没有找到“姓名”列');
    }

    const headerRow = rows[headerRowIndex];
    const nameColumnIndex = headerRow.findIndex((cell) =>
      String(cell ?? '').trim().includes('姓名'),
    );
    const names = rows
      .slice(headerRowIndex + 1)
      .map((row) => this.normalizeImportedName(row[nameColumnIndex]))
      .filter((name): name is string => Boolean(name));

    return Array.from(new Set(names));
  }

  private normalizeImportedName(value: unknown) {
    const name = String(value ?? '').trim();
    if (!name || name === '姓名') {
      return null;
    }
    return name;
  }
}
