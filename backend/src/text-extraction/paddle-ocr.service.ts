import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';

type PaddleLayoutBlock = {
  block_label?: string;
  block_content?: string;
  block_order?: number | null;
  block_bbox?: number[];
};

type PaddleLayoutParsingResult = {
  prunedResult?: {
    parsing_res_list?: PaddleLayoutBlock[];
  };
  markdown?: {
    text?: string;
  };
};

type PaddleResponse = {
  result?: {
    layoutParsingResults?: PaddleLayoutParsingResult[];
  };
  layoutParsingResults?: PaddleLayoutParsingResult[];
  error?: string;
  message?: string;
};

@Injectable()
export class PaddleOcrService {
  private readonly logger = new Logger(PaddleOcrService.name);
  private readonly apiUrl = process.env.PADDLE_OCR_API_URL?.trim() ?? '';
  private readonly token = process.env.PADDLE_OCR_TOKEN?.trim() ?? '';

  isEnabled() {
    return !!this.apiUrl && !!this.token;
  }

  async recognize(input: { kind: FileKind; buffer: Buffer }) {
    if (!this.isEnabled()) {
      throw new InternalServerErrorException(
        '缺少 Paddle OCR 配置，请在 .env 中配置 PADDLE_OCR_API_URL 和 PADDLE_OCR_TOKEN',
      );
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: input.buffer.toString('base64'),
        fileType: input.kind === FileKind.PDF ? 0 : 1,
        useDocOrientationClassify: this.parseBoolean(
          process.env.PADDLE_OCR_USE_DOC_ORIENTATION_CLASSIFY,
          false,
        ),
        useDocUnwarping: this.parseBoolean(
          process.env.PADDLE_OCR_USE_DOC_UNWARPING,
          false,
        ),
        useChartRecognition: false,
      }),
    });

    const json = (await response.json()) as PaddleResponse;
    if (!response.ok) {
      throw new InternalServerErrorException(
        `Paddle OCR 调用失败：${response.status} ${json.message || json.error || response.statusText}`,
      );
    }

    const results = json.result?.layoutParsingResults ?? json.layoutParsingResults ?? [];
    const rawText = results.map((item) => this.extractResultText(item)).join('\n\n');
    const cleanedText = this.cleanEssayOcrText(rawText);

    if (!cleanedText) {
      this.logger.warn('Paddle OCR 未提取到有效作文文本');
    }

    return {
      titleText: '',
      contentText: cleanedText,
      fullText: cleanedText,
      rawText,
    };
  }

  private extractResultText(result: PaddleLayoutParsingResult) {
    const blocks = result.prunedResult?.parsing_res_list ?? [];
    if (blocks.length === 0) {
      return result.markdown?.text ?? '';
    }

    return blocks
      .filter((block) => this.shouldKeepBlock(block))
      .sort((first, second) => this.getBlockOrder(first) - this.getBlockOrder(second))
      .map((block) => this.cleanBlockText(block.block_content ?? ''))
      .filter(Boolean)
      .join('\n\n');
  }

  private shouldKeepBlock(block: PaddleLayoutBlock) {
    const label = (block.block_label ?? '').toLowerCase();
    if (
      [
        'footer',
        'footer_image',
        'header',
        'header_image',
        'number',
        'footnote',
        'aside_text',
      ].includes(label)
    ) {
      return false;
    }

    const text = this.cleanBlockText(block.block_content ?? '');
    if (!text) {
      return false;
    }

    if (this.isTemplateNoise(text)) {
      return false;
    }

    return true;
  }

  private cleanEssayOcrText(text: string) {
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => this.cleanBlockText(line))
      .filter((line) => line && !this.isTemplateNoise(line));

    const normalized: string[] = [];
    for (const line of lines) {
      const previous = normalized[normalized.length - 1];
      if (previous && previous === line) {
        continue;
      }
      normalized.push(line);
    }

    return normalized.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  private cleanBlockText(text: string) {
    return text
      .replace(/\r/g, '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/[_＿]{2,}/g, ' ')
      .replace(/[—-]{6,}/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  private isTemplateNoise(text: string) {
    const compact = text.replace(/\s/g, '');
    if (!compact) {
      return true;
    }

    const underscoreCount = (text.match(/[_＿]/g) ?? []).length;
    if (underscoreCount >= 12 || underscoreCount / Math.max(text.length, 1) > 0.28) {
      return true;
    }

    if (/^学号[:：]?$/.test(compact) || /^姓名[:：]?$/.test(compact)) {
      return true;
    }

    if (/^(九|七|八|初|高|[0-9]+)?[一二三四五六七八九十0-9]*年级.*姓名/.test(compact)) {
      return true;
    }

    if (/^(九|七|八|初|高|[0-9]+)?[一二三四五六七八九十0-9]*年级[一二三四五六七八九十0-9]*班$/.test(compact)) {
      return true;
    }

    if (/^姓名[\u4e00-\u9fa5·.。]{1,8}$/.test(compact)) {
      return true;
    }

    if (/^(8K|16K)?作文活页$/i.test(compact)) {
      return true;
    }

    if (/^\d{2,4}[℃度]$/.test(compact) || /^\d{2,4}字$/.test(compact)) {
      return true;
    }

    if (/^\$?.*\d+\s*[×x]\s*\d+\s*=/.test(compact)) {
      return true;
    }

    if (/孔子|双星纸品|己所不欲|勿施于人/.test(compact)) {
      return true;
    }

    return false;
  }

  private getBlockOrder(block: PaddleLayoutBlock) {
    if (typeof block.block_order === 'number') {
      return block.block_order;
    }

    const bbox = block.block_bbox ?? [];
    return (bbox[1] ?? 0) * 10_000 + (bbox[0] ?? 0);
  }

  private parseBoolean(raw: string | undefined, fallback: boolean) {
    if (raw === undefined) {
      return fallback;
    }
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }
}
