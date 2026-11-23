import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

const teacherSelect = {
  ...userSelect,
  status: true,
  classes: {
    select: { id: true, name: true, academicYear: true },
    orderBy: [{ academicYear: 'desc' }, { name: 'asc' }],
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findSessionUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...userSelect, status: true, tokenVersion: true },
    });
  }

  sanitizeUser(user: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  listTeachers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.TEACHER },
      orderBy: [{ displayName: 'asc' }, { username: 'asc' }],
      select: teacherSelect,
    });
  }

  async createTeacher(dto: CreateTeacherDto) {
    const initialPassword = randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const { id } = await tx.user.create({
          data: {
            username: dto.username,
            displayName: dto.displayName,
            role: UserRole.TEACHER,
            passwordHash,
            mustChangePassword: true,
          },
          select: { id: true },
        });
        if (dto.classIds.length) {
          const assigned = await tx.class.updateMany({
            where: { id: { in: dto.classIds }, teacherId: null },
            data: { teacherId: id },
          });
          if (assigned.count !== dto.classIds.length) {
            throw new ConflictException(
              '所选班级已分配或不存在，请刷新后重新选择',
            );
          }
        }
        return tx.user.findUniqueOrThrow({
          where: { id },
          select: teacherSelect,
        });
      });
      return { user, initialPassword };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('登录账号已存在');
      }
      throw error;
    }
  }

  async resetTeacherPassword(id: string) {
    const initialPassword = randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const user = await this.updateTeacher(id, {
      passwordHash,
      mustChangePassword: true,
      tokenVersion: { increment: 1 },
    });
    return { user, initialPassword };
  }

  updateTeacherStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    return this.updateTeacher(id, {
      status,
      ...(status === 'DISABLED' ? { tokenVersion: { increment: 1 } } : {}),
    });
  }

  updatePassword(id: string, tokenVersion: number, passwordHash: string) {
    return this.prisma.user.updateMany({
      where: { id, tokenVersion, status: 'ACTIVE' },
      data: {
        passwordHash,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
  }

  private async updateTeacher(id: string, data: Prisma.UserUpdateInput) {
    try {
      return await this.prisma.user.update({
        where: { id, role: UserRole.TEACHER },
        data,
        select: teacherSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('教师账号不存在');
      }
      throw error;
    }
  }
}
