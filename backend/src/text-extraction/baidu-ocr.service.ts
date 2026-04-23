import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type BaiduOcrJobStatus = 'Pending' | 'Processing' | 'Success' | 'Failed';

type BaiduOcrResult = {
  titleText: string;
  contentText: string;
  fullText: string;
};

type CreateTaskResponse = {
  error_code?: number;
  error_msg?: string;
  result?: {
    task_id?: string;
  };
  log_id?: number | string;
};

type GetResultResponse = {
  error_code?: number;
  error_msg?: string;
  result?: {
    task_id?: string;
    status?: BaiduOcrJobStatus;
    result?: {
      essayOverall?: {
        titleText?: string;
        contentText?: string;
      };
      title?: {
        text?: string;
      };
      content?: {
        paragraphs?: Array<{
          text?: string;
        }>;
      };
    };
  };
  log_id?: number | string;
};

@Injectable()
export class BaiduOcrService {
  private readonly logger = new Logger(BaiduOcrService.name);
  private readonly accessToken =
    process.env.BAIDU_OCR_ACCESS_TOKEN?.trim() ?? this.readAccessTokenFromFile();
  private readonly createTaskUrl =
    process.env.BAIDU_OCR_CREATE_URL ??
    'https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting_composition/create_task';
  private readonly getResultUrl =
    process.env.BAIDU_OCR_GET_RESULT_URL ??
    'https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting_composition/get_result';
  private readonly pollIntervalMs = this.parseNumber(
    process.env.BAIDU_OCR_POLL_INTERVAL_MS,
    4000,
  );
  private readonly maxAttempts = this.parseNumber(
    process.env.BAIDU_OCR_MAX_ATTEMPTS,
    16,
  );

  isEnabled() {
    return !!this.accessToken;
  }

  async recognize(input: {
    kind: FileKind;
    buffer: Buffer;
    pdfFileNum?: string;
  }): Promise<BaiduOcrResult> {
    const taskId = await this.createTask(input);
    return this.waitForResult(taskId);
  }

  async createTask(input: {
    kind: FileKind;
    buffer: Buffer;
    pdfFileNum?: string;
  }) {
    const accessToken = this.requireAccessToken();
    const bodyParts: string[] = [];
    const encodedPayload = encodeURIComponent(input.buffer.toString('base64'));

    if (input.kind === FileKind.PDF) {
      bodyParts.push(`pdf_file=${encodedPayload}`);
      if (input.pdfFileNum?.trim()) {
        bodyParts.push(
          `pdf_file_num=${encodeURIComponent(input.pdfFileNum.trim())}`,
        );
      }
    } else {
      bodyParts.push(`image=${encodedPayload}`);
    }

    const response = await fetch(
      `${this.createTaskUrl}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParts.join('&'),
      },
    );

    const json = (await response.json()) as CreateTaskResponse;
    this.assertSuccess(json, '提交百度 OCR 任务失败');

    const taskId = json.result?.task_id?.trim();
    if (!taskId) {
      throw new InternalServerErrorException('百度 OCR 未返回有效 task_id');
    }

    return taskId;
  }

  async waitForResult(taskId: string): Promise<BaiduOcrResult> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(this.pollIntervalMs);
      }

      const result = await this.getResult(taskId);
      if (result.status === 'Success') {
        return result.data;
      }

      if (result.status === 'Failed') {
        throw new InternalServerErrorException('百度 OCR 识别失败');
      }
    }

    throw new InternalServerErrorException('百度 OCR 识别超时，请稍后重试');
  }

  private async getResult(taskId: string) {
    const accessToken = this.requireAccessToken();
    const response = await fetch(
      `${this.getResultUrl}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id: taskId }),
      },
    );

    const json = (await response.json()) as GetResultResponse;
    this.assertSuccess(json, '获取百度 OCR 结果失败', ['Pending', 'Processing']);

    const status = json.result?.status;
    if (status === 'Pending' || status === 'Processing') {
      return { status, data: null };
    }

    if (status !== 'Success') {
      this.logger.warn(`百度 OCR 返回异常状态: ${status ?? 'UNKNOWN'}`);
      return { status: 'Failed' as const, data: null };
    }

    return {
      status,
      data: this.normalizeResult(json),
    };
  }

  private normalizeResult(response: GetResultResponse): BaiduOcrResult {
    const result = response.result?.result;
    const titleText = this.normalizeText(
      result?.essayOverall?.titleText ?? result?.title?.text ?? '',
    );
    const contentText = this.normalizeText(
      result?.essayOverall?.contentText ??
        result?.content?.paragraphs
          ?.map((paragraph) => paragraph.text?.trim() ?? '')
          .filter(Boolean)
          .join('\n\n') ??
        '',
    );

    const fullText = [titleText, contentText].filter(Boolean).join('\n\n').trim();
    return {
      titleText,
      contentText,
      fullText,
    };
  }

  private assertSuccess(
    response: { error_code?: number; error_msg?: string; log_id?: number | string },
    fallbackMessage: string,
    allowedMessages: string[] = [],
  ) {
    const errorCode = response.error_code ?? 0;
    const errorMessage = response.error_msg?.trim() ?? '';

    if (errorCode === 0) {
      return;
    }

    if (allowedMessages.includes(errorMessage)) {
      return;
    }

    throw new InternalServerErrorException(
      `${fallbackMessage}：${errorCode} ${errorMessage || '未知错误'}`,
    );
  }

  private requireAccessToken() {
    if (!this.accessToken) {
      throw new InternalServerErrorException(
        '缺少百度 OCR access_token，请在 .env 或 key 文件中配置',
      );
    }

    return this.accessToken;
  }

  private readAccessTokenFromFile() {
    const keyFilePath = this.resolveKeyFilePath();
    if (!keyFilePath || !existsSync(keyFilePath)) {
      return '';
    }

    const fileText = readFileSync(keyFilePath, 'utf8');
    const matched = fileText.match(/access_token:\s*(\S+)/i);
    return matched?.[1]?.trim() ?? '';
  }

  private resolveKeyFilePath() {
    const candidates = [
      process.env.BAIDU_OCR_KEY_FILE?.trim(),
      resolve(process.cwd(), '作文管理平台key.txt'),
      resolve(process.cwd(), 'backend', '作文管理平台key.txt'),
    ].filter(Boolean) as string[];

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? '';
  }

  private parseNumber(raw: string | undefined, fallback: number) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private normalizeText(text: string) {
    return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  private sleep(ms: number) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  }
}
