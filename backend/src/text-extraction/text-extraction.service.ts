import { Injectable } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { BaiduOcrService } from './baidu-ocr.service';

type ExtractionOptions = {
  waitForOcr?: boolean;
  pdfFileNum?: string;
};

@Injectable()
export class TextExtractionService {
  constructor(private readonly baiduOcrService: BaiduOcrService) {}

  async extractText(
    input: { kind: FileKind; buffer: Buffer },
    options: ExtractionOptions = {},
  ) {
    if (input.kind !== FileKind.PDF) {
      if (!this.baiduOcrService.isEnabled()) {
        return {
          text: '',
          requiresManualCorrection: true,
          requiresOcrPolling: false,
          source: 'MANUAL_INPUT',
        };
      }

      if (options.waitForOcr) {
        const ocrResult = await this.baiduOcrService.recognize({
          kind: input.kind,
          buffer: input.buffer,
        });

        return {
          text: ocrResult.fullText,
          requiresManualCorrection: ocrResult.fullText.length < 20,
          requiresOcrPolling: false,
          source: 'BAIDU_OCR',
        };
      }

      return {
        text: '',
        requiresManualCorrection: false,
        requiresOcrPolling: true,
        source: 'BAIDU_OCR_PENDING',
      };
    }

    const text = await this.extractPdfText(input.buffer);
    if (text.length >= 80) {
      return {
        text,
        requiresManualCorrection: false,
        requiresOcrPolling: false,
        source: 'PDF_TEXT',
      };
    }

    if (!this.baiduOcrService.isEnabled()) {
      return {
        text,
        requiresManualCorrection: true,
        requiresOcrPolling: false,
        source: 'PDF_NO_TEXT',
      };
    }

    if (options.waitForOcr) {
      const ocrResult = await this.baiduOcrService.recognize({
        kind: input.kind,
        buffer: input.buffer,
        pdfFileNum: options.pdfFileNum,
      });

      return {
        text: ocrResult.fullText,
        requiresManualCorrection: ocrResult.fullText.length < 20,
        requiresOcrPolling: false,
        source: 'BAIDU_OCR',
      };
    }

    return {
      text,
      requiresManualCorrection: false,
      requiresOcrPolling: true,
      source: 'PDF_NO_TEXT',
    };
  }

  async extractPdfText(buffer: Buffer) {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse =
      (pdfParseModule as unknown as { default?: (buffer: Buffer) => Promise<{ text?: string }> })
        .default ?? (pdfParseModule as unknown as (buffer: Buffer) => Promise<{ text?: string }>);
    const parsed = await pdfParse(buffer);
    return this.normalizeText(parsed.text ?? '');
  }

  private normalizeText(text: string) {
    return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
}
