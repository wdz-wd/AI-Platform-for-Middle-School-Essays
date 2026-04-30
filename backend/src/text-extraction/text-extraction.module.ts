import { Module } from '@nestjs/common';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { BaiduOcrTokenService } from './baidu-ocr-token.service';
import { BaiduOcrService } from './baidu-ocr.service';
import { PaddleOcrService } from './paddle-ocr.service';
import { TextExtractionService } from './text-extraction.service';

@Module({
  imports: [AiReviewModule],
  providers: [
    BaiduOcrTokenService,
    BaiduOcrService,
    PaddleOcrService,
    TextExtractionService,
  ],
  exports: [TextExtractionService],
})
export class TextExtractionModule {}
