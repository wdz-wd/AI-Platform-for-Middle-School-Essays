import { Module } from '@nestjs/common';
import { BaiduOcrService } from './baidu-ocr.service';
import { TextExtractionService } from './text-extraction.service';

@Module({
  providers: [BaiduOcrService, TextExtractionService],
  exports: [TextExtractionService],
})
export class TextExtractionModule {}
