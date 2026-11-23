import { Injectable, Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { AiReviewService } from '../ai-review/ai-review.service';
import { BaiduOcrService } from './baidu-ocr.service';
import { extractOcrHeaderName } from './ocr-student-match';
import { PaddleOcrCheckpoint, PaddleOcrService } from './paddle-ocr.service';

type ExtractionOptions = {
  waitForOcr?: boolean;
  pdfFileNum?: string;
  ocrProgress?: Record<string, PaddleOcrCheckpoint>;
  onOcrProgress?: (
    stage: string,
    checkpoint: PaddleOcrCheckpoint,
  ) => Promise<void>;
};

type ExtractionResult = {
  text: string;
  requiresManualCorrection: boolean;
  requiresOcrPolling: boolean;
  source: string;
  ocrRawText?: string;
  ocrHeaderName?: string | null;
};

@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);
  private readonly ocrProvider = (
    process.env.OCR_PROVIDER ??
    process.env.TEXT_EXTRACTION_OCR_PROVIDER ??
    'baidu'
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
  ): Promise<ExtractionResult> {
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
        const ocrResult = await this.recognizeWithConfiguredProvider(
          {
            kind: input.kind,
            buffer: input.buffer,
          },
          options,
        );

        return {
          text: ocrResult.fullText,
          requiresManualCorrection: ocrResult.fullText.length < 20,
          requiresOcrPolling: false,
          source: ocrResult.source,
          ocrRawText: ocrResult.ocrRawText,
          ocrHeaderName: ocrResult.ocrHeaderName,
        };
      }

      return {
        text: '',
        requiresManualCorrection: false,
        requiresOcrPolling: true,
        source:
          this.ocrProvider === 'paddle'
            ? 'PADDLE_OCR_PENDING'
            : 'BAIDU_OCR_PENDING',
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
      const ocrResult = await this.recognizeWithConfiguredProvider(
        {
          kind: input.kind,
          buffer: input.buffer,
          pdfFileNum: options.pdfFileNum,
        },
        options,
      );

      return {
        text: ocrResult.fullText,
        requiresManualCorrection: ocrResult.fullText.length < 20,
        requiresOcrPolling: false,
        source: ocrResult.source,
        ocrRawText: ocrResult.ocrRawText,
        ocrHeaderName: ocrResult.ocrHeaderName,
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
      (
        pdfParseModule as unknown as {
          default?: (buffer: Buffer) => Promise<{ text?: string }>;
        }
      ).default ??
      (pdfParseModule as unknown as (
        buffer: Buffer,
      ) => Promise<{ text?: string }>);
    const parsed = await pdfParse(buffer);
    return this.normalizeText(parsed.text ?? '');
  }

  private isOcrEnabled() {
    if (this.ocrProvider === 'paddle') {
      return this.paddleOcrService.isEnabled();
    }

    return this.baiduOcrService.isEnabled();
  }

  private async recognizeWithConfiguredProvider(
    input: {
      kind: FileKind;
      buffer: Buffer;
      pdfFileNum?: string;
    },
    options: ExtractionOptions = {},
  ) {
    if (this.ocrProvider === 'paddle') {
      const result = await this.paddleOcrService.recognize(input, {
        checkpoint: options.ocrProgress?.body,
        onCheckpoint: (checkpoint) =>
          options.onOcrProgress?.('body', checkpoint) ?? Promise.resolve(),
      });
      const cleaned = await this.cleanupPaddleText(
        result.rawText,
        result.fullText,
      );
      const ocrHeaderName =
        cleaned.studentName || extractOcrHeaderName(result.rawText);
      return {
        ...result,
        fullText: cleaned.fullText,
        ocrRawText: result.rawText,
        ocrHeaderName,
        source: 'PADDLE_OCR',
      };
    }

    const result = await this.baiduOcrService.recognize(input);
    return {
      ...result,
      ocrRawText: undefined,
      ocrHeaderName: undefined,
      source: 'BAIDU_OCR',
    };
  }

  private async cleanupPaddleText(rawText: string, fallbackText: string) {
    const normalized = this.normalizeText(rawText);
    const fallback = this.normalizeText(fallbackText);
    if (!normalized) {
      return { fullText: fallback, studentName: '' };
    }

    try {
      const cleaned = await this.aiReviewService.cleanupOcrEssayText({
        rawText: normalized,
      });
      const faithful = this.preservesSourceWords(normalized, cleaned.fullText);
      if (!faithful) {
        this.logger.warn('Paddle OCR 文本整理改变了原文字词，保留规则清洗正文');
      }
      return {
        fullText: faithful ? cleaned.fullText || fallback : fallback,
        studentName: cleaned.studentName,
      };
    } catch (error) {
      this.logger.warn(
        `Paddle OCR 文本 AI 整理失败，使用规则清洗结果: ${String(error)}`,
      );
      return { fullText: fallback, studentName: '' };
    }
  }

  private preservesSourceWords(source: string, extracted: string) {
    const characters = (text: string) =>
      text
        .replace(/<[^>]*>/g, '')
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
    const original = Array.from(characters(source));
    let cursor = 0;
    for (const char of characters(extracted)) {
      while (cursor < original.length && original[cursor] !== char) cursor++;
      if (cursor === original.length) return false;
      cursor++;
    }
    return true;
  }

  private normalizeText(text: string) {
    return text
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
