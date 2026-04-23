import { Module } from '@nestjs/common';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { FilesModule } from '../files/files.module';
import { JobsModule } from '../jobs/jobs.module';
import { TextExtractionModule } from '../text-extraction/text-extraction.module';
import { EssayTasksController } from './essay-tasks.controller';
import { EssayTasksService } from './essay-tasks.service';

@Module({
  imports: [FilesModule, TextExtractionModule, JobsModule, AiReviewModule],
  controllers: [EssayTasksController],
  providers: [EssayTasksService],
  exports: [EssayTasksService],
})
export class EssayTasksModule {}
