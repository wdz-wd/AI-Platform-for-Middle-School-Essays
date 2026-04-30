import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { BaiduOcrTokenService } from './baidu-ocr-token.service';

type BaiduOcrJobStatus =
  | 'Pending'
  | 'Processing'
  | 'Running'
  | 'Success'
  | 'Failed';

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

  constructor(private readonly tokenService: BaiduOcrTokenService) {}

  isEnabled() {
    return this.tokenService.isEnabled();
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

    const json = await this.postFormWithTokenRetry<CreateTaskResponse>(
      this.createTaskUrl,
      bodyParts.join('&'),
    );
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
    const json = await this.postJsonWithTokenRetry<GetResultResponse>(
      this.getResultUrl,
      { task_id: taskId },
    );
    this.assertSuccess(json, '获取百度 OCR 结果失败', ['Pending', 'Processing']);

    const status = json.result?.status;
    if (status === 'Pending' || status === 'Processing' || status === 'Running') {
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

  private async postFormWithTokenRetry<T extends { error_code?: number; error_msg?: string }>(
    url: string,
    body: string,
  ) {
    return this.requestWithTokenRetry<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  }

  private async postJsonWithTokenRetry<T extends { error_code?: number; error_msg?: string }>(
    url: string,
    payload: Record<string, string>,
  ) {
    return this.requestWithTokenRetry<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  private async requestWithTokenRetry<T extends { error_code?: number; error_msg?: string }>(
    url: string,
    init: RequestInit,
  ) {
    let json = await this.requestWithToken<T>(url, init, false);
    if (this.isAuthError(json)) {
      json = await this.requestWithToken<T>(url, init, true);
    }

    return json;
  }

  private async requestWithToken<T>(
    url: string,
    init: RequestInit,
    forceRefresh: boolean,
  ) {
    const accessToken = await this.tokenService.getAccessToken(forceRefresh);
    const response = await fetch(
      `${url}?access_token=${encodeURIComponent(accessToken)}`,
      init,
    );
    return (await response.json()) as T;
  }

  private isAuthError(response: { error_code?: number; error_msg?: string }) {
    const code = response.error_code ?? 0;
    const message = response.error_msg?.toLowerCase() ?? '';
    return (
      code === 110 ||
      code === 111 ||
      message.includes('access token invalid') ||
      message.includes('access token expired')
    );
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
