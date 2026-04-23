import { Module } from '@nestjs/common';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { FilesModule } from '../files/files.module';
import { TextExtractionModule } from '../text-extraction/text-extraction.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [AiReviewModule, FilesModule, TextExtractionModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
