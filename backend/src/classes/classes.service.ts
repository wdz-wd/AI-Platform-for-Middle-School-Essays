import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { CurrentUserType } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  list(currentUser: CurrentUserType) {
    if (currentUser.role === UserRole.ADMIN) {
      return this.prisma.class.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          teacher: {
            select: { id: true, displayName: true, username: true },
          },
          _count: {
            select: { students: true, essayTasks: true },
          },
        },
      });
    }

    return this.prisma.class.findMany({
      where: { teacherId: currentUser.id },
      orderBy: { createdAt: 'desc' },
      include: {
        teacher: {
          select: { id: true, displayName: true, username: true },
        },
        _count: {
          select: { students: true, essayTasks: true },
        },
      },
    });
  }

  async assertClassAccess(classId: string, currentUser: CurrentUserType) {
    const classEntity = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classEntity) {
      throw new NotFoundException('班级不存在');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      classEntity.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('无权访问该班级');
    }

    return classEntity;
  }

  create(dto: CreateClassDto) {
    return this.prisma.class.create({
      data: dto,
    });
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.assertExists(id);
    return this.prisma.class.update({
      where: { id },
      data: dto,
    });
  }

  private async assertExists(id: string) {
    const classEntity = await this.prisma.class.findUnique({ where: { id } });
    if (!classEntity) {
      throw new NotFoundException('班级不存在');
    }

    return classEntity;
  }
}
