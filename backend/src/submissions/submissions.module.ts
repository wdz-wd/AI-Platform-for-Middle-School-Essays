import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { JobsModule } from '../jobs/jobs.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [FilesModule, JobsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
