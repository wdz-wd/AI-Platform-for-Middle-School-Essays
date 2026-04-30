import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ArchiveModule } from './archive/archive.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { resolveBackendEnvFiles } from './common/paths';
import { EssayTasksModule } from './essay-tasks/essay-tasks.module';
import { FilesModule } from './files/files.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrintModule } from './print/print.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StudentsModule } from './students/students.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: resolveBackendEnvFiles() }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ClassesModule,
    StudentsModule,
    FilesModule,
    JobsModule,
    EssayTasksModule,
    SubmissionsModule,
    ReviewsModule,
    PrintModule,
    ArchiveModule,
  ],
})
export class AppModule {}
