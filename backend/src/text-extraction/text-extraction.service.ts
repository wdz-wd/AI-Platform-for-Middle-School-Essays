import { Injectable, Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { AiReviewService } from '../ai-review/ai-review.service';
import { BaiduOcrService } from './baidu-ocr.service';
import { PaddleOcrService } from './paddle-ocr.service';

type ExtractionOptions = {
  waitForOcr?: boolean;
  pdfFileNum?: string;
};

@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);
  private readonly ocrProvider = (
    process.env.OCR_PROVIDER ?? process.env.TEXT_EXTRACTION_OCR_PROVIDER ?? 'baidu'
  )
    .trim()
    .toLowerCase();

  constructor(
    private readonly baiduOcrService: BaiduOcrService,
    private readonly paddleOcrService: PaddleOcrService,
    private readonly aiReviewService: AiReviewService,
  ) {}

  async extractText(
    input: { kind: FileKind; buffer: Buffer },
    options: ExtractionOptions = {},
  ) {
    if (input.kind !== FileKind.PDF) {
      if (!this.isOcrEnabled()) {
        return {
          text: '',
          requiresManualCorrection: true,
          requiresOcrPolling: false,
          source: 'MANUAL_INPUT',
        };
      }

      if (options.waitForOcr) {
        const ocrResult = await this.recognizeWithConfiguredProvider({
          kind: input.kind,
          buffer: input.buffer,
        });

        return {
          text: ocrResult.fullText,
          requiresManualCorrection: ocrResult.fullText.length < 20,
          requiresOcrPolling: false,
          source: ocrResult.source,
        };
      }

      return {
        text: '',
        requiresManualCorrection: false,
        requiresOcrPolling: true,
        source: this.ocrProvider === 'paddle' ? 'PADDLE_OCR_PENDING' : 'BAIDU_OCR_PENDING',
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

    if (!this.isOcrEnabled()) {
      return {
        text,
        requiresManualCorrection: true,
        requiresOcrPolling: false,
        source: 'PDF_NO_TEXT',
      };
    }

    if (options.waitForOcr) {
      const ocrResult = await this.recognizeWithConfiguredProvider({
        kind: input.kind,
        buffer: input.buffer,
        pdfFileNum: options.pdfFileNum,
      });

      return {
        text: ocrResult.fullText,
        requiresManualCorrection: ocrResult.fullText.length < 20,
        requiresOcrPolling: false,
        source: ocrResult.source,
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

  private isOcrEnabled() {
    if (this.ocrProvider === 'paddle') {
      return this.paddleOcrService.isEnabled();
    }

    return this.baiduOcrService.isEnabled();
  }

  private async recognizeWithConfiguredProvider(input: {
    kind: FileKind;
    buffer: Buffer;
    pdfFileNum?: string;
  }) {
    if (this.ocrProvider === 'paddle') {
      const result = await this.paddleOcrService.recognize(input);
      return {
        ...result,
        fullText: await this.cleanupPaddleText(result.fullText),
        source: 'PADDLE_OCR',
      };
    }

    const result = await this.baiduOcrService.recognize(input);
    return {
      ...result,
      source: 'BAIDU_OCR',
    };
  }

  private async cleanupPaddleText(text: string) {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return '';
    }

    try {
      const cleaned = await this.aiReviewService.cleanupOcrEssayText({
        rawText: normalized,
      });
      return cleaned.fullText || normalized;
    } catch (error) {
      this.logger.warn(`Paddle OCR 文本 AI 整理失败，使用规则清洗结果: ${String(error)}`);
      return normalized;
    }
  }

  private normalizeText(text: string) {
    return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
}
