import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OcrJobExpiredError, OcrRetryableError } from './ocr-retryable.error';

export type PaddleOcrResult = {
  titleText: string;
  contentText: string;
  fullText: string;
  rawText: string;
};

export type PaddleOcrCheckpoint = {
  inputHash: string;
  jobId?: string;
  completed?: PaddleOcrResult;
  rawTextVersion?: number;
};

export type PaddleOcrOptions = {
  maxAttempts?: number;
  checkpoint?: PaddleOcrCheckpoint;
  onCheckpoint?: (checkpoint: PaddleOcrCheckpoint) => Promise<void>;
};

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
};

type PaddleApiResponse<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type PaddleJob = {
  jobId?: string;
  state?: 'pending' | 'running' | 'done' | 'failed';
  errorMsg?: string;
  resultUrl?: { jsonUrl?: string };
};

@Injectable()
export class PaddleOcrService {
  private readonly logger = new Logger(PaddleOcrService.name);
  private readonly apiUrl = (
    process.env.PADDLE_OCR_API_URL?.trim() ||
    'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'
  ).replace(/\/$/, '');
  private readonly token = process.env.PADDLE_OCR_TOKEN?.trim() ?? '';
  private readonly model =
    process.env.PADDLE_OCR_MODEL?.trim() || 'PaddleOCR-VL-1.6';
  private readonly pollIntervalMs = this.parsePositiveInteger(
    process.env.PADDLE_OCR_POLL_INTERVAL_MS,
    5000,
  );
  private readonly maxAttempts = this.parsePositiveInteger(
    process.env.PADDLE_OCR_MAX_ATTEMPTS,
    120,
  );
  private readonly requestIntervalMs = this.parsePositiveInteger(
    process.env.PADDLE_OCR_REQUEST_INTERVAL_MS,
    2000,
  );
  private readonly maxRetries = this.parsePositiveInteger(
    process.env.PADDLE_OCR_MAX_RETRIES,
    5,
  );
  private readonly retryBaseMs = this.parsePositiveInteger(
    process.env.PADDLE_OCR_RETRY_BASE_MS,
    5000,
  );
  // All submissions and polls share this process-local gate.
  private apiRequestTail: Promise<void> = Promise.resolve();
  private nextApiRequestAt = 0;
  private adaptiveRequestIntervalMs = this.requestIntervalMs;
  private throttleStreak = 0;
  private successfulRequests = 0;

  constructor() {
    if (this.isEnabled()) {
      this.logger.log(
        `Paddle OCR 单次全文识别 v4（含断点续接 v3、限流保护 v2）：初始请求间隔 ${this.requestIntervalMs}ms，轮询间隔 ${this.pollIntervalMs}ms，最多重试 ${this.maxRetries} 次；保留姓名栏，不再裁剪补识别`,
      );
    }
  }

  isEnabled() {
    return !!this.token;
  }

  async recognize(
    input: { kind: FileKind; buffer: Buffer },
    options: PaddleOcrOptions = {},
  ) {
    if (!this.isEnabled()) {
      throw new InternalServerErrorException(
        '缺少 Paddle OCR 配置，请在 .env 中配置 PADDLE_OCR_TOKEN',
      );
    }

    if (input.buffer.length > 50 * 1024 * 1024) {
      throw new InternalServerErrorException(
        'Paddle OCR 上传文件不能超过 50 MB',
      );
    }

    const form = new FormData();
    const extension =
      input.kind === FileKind.PDF
        ? 'pdf'
        : input.kind === FileKind.PNG
          ? 'png'
          : 'jpg';
    const mimeType =
      extension === 'pdf'
        ? 'application/pdf'
        : `image/${extension === 'jpg' ? 'jpeg' : 'png'}`;
    form.set(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: mimeType }),
      `essay.${extension}`,
    );
    form.set('model', this.model);
    form.set(
      'optionalPayload',
      JSON.stringify({
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
    );

    const inputHash = createHash('sha256')
      .update(this.apiUrl)
      .update(this.token)
      .update(this.model)
      .update(input.kind)
      .update(String(form.get('optionalPayload')))
      .update(input.buffer)
      .digest('hex');
    const checkpoint =
      options.checkpoint?.inputHash === inputHash
        ? options.checkpoint
        : { inputHash };
    // Old completed checkpoints contain filtered text without header metadata.
    // Refresh those through the existing job ID instead of uploading again.
    if (checkpoint.completed && checkpoint.rawTextVersion === 2)
      return checkpoint.completed;

    let jobId = checkpoint.jobId;
    if (!jobId) {
      const submitted = await this.requestApi<PaddleJob>(this.apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
      });
      jobId = submitted.jobId;
      if (jobId) await options.onCheckpoint?.({ inputHash, jobId });
    } else {
      this.logger.log(`Paddle OCR 续接任务：${jobId}`);
    }
    if (!jobId) {
      throw new InternalServerErrorException('Paddle OCR 未返回任务 ID');
    }

    let resultUrl = '';
    const maxAttempts = Math.max(
      1,
      Math.min(options.maxAttempts ?? this.maxAttempts, this.maxAttempts),
    );
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      let job: PaddleJob;
      try {
        job = await this.requestApi<PaddleJob>(
          `${this.apiUrl}/${encodeURIComponent(jobId)}`,
          { headers: { Authorization: `Bearer ${this.token}` } },
        );
      } catch (error) {
        if (error instanceof OcrJobExpiredError) {
          await options.onCheckpoint?.({ inputHash });
        }
        throw error;
      }
      if (job.state === 'failed') {
        throw new InternalServerErrorException(
          `Paddle OCR 解析失败：${job.errorMsg || '未知原因'}`,
        );
      }
      if (job.state === 'done') {
        resultUrl = job.resultUrl?.jsonUrl ?? '';
        break;
      }
      if (job.state !== 'pending' && job.state !== 'running') {
        throw new InternalServerErrorException('Paddle OCR 返回了未知任务状态');
      }
    }
    if (!resultUrl) {
      throw new OcrRetryableError('Paddle OCR 任务超时或缺少结果地址');
    }

    const parsedUrl = new URL(resultUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new InternalServerErrorException('Paddle OCR 返回了无效结果地址');
    }
    let jsonl: string;
    try {
      const resultResponse = await fetch(parsedUrl, {
        signal: AbortSignal.timeout(60000),
      });
      if (!resultResponse.ok) {
        // Signed result links can expire; re-query the same job for a fresh URL.
        if (
          [401, 403, 404, 408, 429, 500, 502, 503, 504].includes(
            resultResponse.status,
          )
        ) {
          throw new OcrRetryableError(
            `Paddle OCR 结果下载暂未成功：${resultResponse.status}`,
          );
        }
        throw new InternalServerErrorException(
          `Paddle OCR 结果下载失败：${resultResponse.status}`,
        );
      }
      jsonl = await resultResponse.text();
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new OcrRetryableError(
        `Paddle OCR 结果下载网络异常：${String(error)}`,
      );
    }
    const results: PaddleLayoutParsingResult[] = [];
    try {
      for (const line of jsonl.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const item = JSON.parse(line) as PaddleResponse;
        results.push(
          ...(item.result?.layoutParsingResults ??
            item.layoutParsingResults ??
            []),
        );
      }
    } catch {
      throw new OcrRetryableError(
        'Paddle OCR 结果文件内容不完整，将重新获取原任务结果',
      );
    }
    if (results.length === 0) {
      throw new InternalServerErrorException('Paddle OCR 结果中没有解析页面');
    }

    const rawText = results
      .map((item) => this.extractResultText(item, true))
      .join('\n\n');
    const cleanedText = this.cleanEssayOcrText(
      results.map((item) => this.extractResultText(item)).join('\n\n'),
    );

    if (!cleanedText) {
      this.logger.warn('Paddle OCR 未提取到有效作文文本');
    }

    const completed = {
      titleText: '',
      contentText: cleanedText,
      fullText: cleanedText,
      rawText,
    };
    await options.onCheckpoint?.({
      inputHash,
      jobId,
      completed,
      rawTextVersion: 2,
    });
    return completed;
  }

  private async requestApi<T>(url: string, options: RequestInit): Promise<T> {
    const isQuery = (options.method ?? 'GET').toUpperCase() === 'GET';
    const operation = isQuery ? '查询任务' : '提交任务';
    for (let retry = 0; retry <= this.maxRetries; retry++) {
      const outcome = await this.scheduleApiRequest(async () => {
        let response: Response;
        let json: PaddleApiResponse<T> | null;
        try {
          response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(60000),
          });
          json = (await response
            .json()
            .catch(() => null)) as PaddleApiResponse<T> | null;
        } catch (error) {
          // A failed POST may already have created a job. Only repeat queries
          // when the server has not explicitly rejected the request.
          if (isQuery) {
            return this.retryOrThrow(
              retry,
              operation,
              `网络异常：${String(error)}`,
            );
          }
          throw new InternalServerErrorException(
            `Paddle OCR ${operation}请求未完成：${String(error)}`,
          );
        }

        if (response.ok && json?.code === 0 && json.data) {
          this.recordSuccessfulRequest();
          return { data: json.data };
        }

        const details = `${response.status}${json?.code !== undefined ? `（code=${json.code}）` : ''} ${json?.msg || response.statusText}`;
        if (isQuery && [11001, 11002].includes(json?.code ?? 0)) {
          throw new OcrJobExpiredError(
            `Paddle OCR 原任务已失效，下次重试将重新提交：${details}`,
          );
        }
        const throttled =
          response.status === 429 ||
          json?.code === 12002 ||
          json?.code === 10010;
        const temporaryQueryError =
          isQuery && [408, 500, 502, 503, 504].includes(response.status);
        if (throttled || temporaryQueryError) {
          return this.retryOrThrow(
            retry,
            operation,
            details,
            response.headers.get('Retry-After'),
            throttled,
          );
        }
        throw new InternalServerErrorException(
          `Paddle OCR ${operation}失败：${details}`,
        );
      });
      if ('data' in outcome) return outcome.data;
    }
    throw new InternalServerErrorException('Paddle OCR 重试次数已用尽');
  }

  private async scheduleApiRequest<T>(request: () => Promise<T>): Promise<T> {
    const previous = this.apiRequestTail;
    let release!: () => void;
    this.apiRequestTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      // Re-check the shared deadline, including cooldowns set by other jobs.
      while (this.nextApiRequestAt > Date.now()) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.nextApiRequestAt - Date.now()),
        );
      }
      this.nextApiRequestAt = Date.now() + this.adaptiveRequestIntervalMs;
      return await request();
    } finally {
      release();
    }
  }

  private retryOrThrow(
    retry: number,
    operation: string,
    details: string,
    retryAfter?: string | null,
    throttled = false,
  ) {
    if (throttled) {
      this.throttleStreak++;
      this.successfulRequests = 0;
      this.adaptiveRequestIntervalMs = Math.min(
        this.adaptiveRequestIntervalMs * 2,
        Math.max(this.requestIntervalMs, 30000),
      );
    }
    // Concurrent jobs share the throttle history: each job's first rejection
    // must not restart the account-wide cooldown at the shortest delay.
    const exponent = Math.min(
      16,
      Math.max(retry, throttled ? this.throttleStreak - 1 : 0),
    );
    const backoff = Math.min(this.retryBaseMs * 2 ** exponent, 60000);
    const retryAfterSeconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
    const serverDelay = Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds * 1000)
      : Math.max(0, Date.parse(retryAfter ?? '') - Date.now()) || 0;
    const delay = Math.max(
      serverDelay,
      backoff + Math.floor(Math.random() * backoff * 0.2),
      this.adaptiveRequestIntervalMs,
    );
    // Keep the cooldown even after this job exhausts its retry budget.
    this.nextApiRequestAt = Math.max(
      this.nextApiRequestAt,
      Date.now() + delay,
      Date.now() + this.adaptiveRequestIntervalMs,
    );
    if (retry >= this.maxRetries) {
      throw new OcrRetryableError(
        `Paddle OCR ${operation}失败：${details}（自动重试 ${this.maxRetries} 次后仍未恢复）`,
      );
    }
    this.logger.warn(
      `Paddle OCR ${operation}暂未成功：${details}；统一等待 ${Math.ceil(delay / 1000)} 秒后重试（${retry + 1}/${this.maxRetries}），当前请求间隔 ${this.adaptiveRequestIntervalMs}ms`,
    );
    return { retry: true as const };
  }

  private recordSuccessfulRequest() {
    this.successfulRequests++;
    // A single successful request does not prove the old frequency is safe.
    if (this.successfulRequests < 20) return;
    this.successfulRequests = 0;
    this.throttleStreak = 0;
    this.adaptiveRequestIntervalMs = Math.max(
      this.requestIntervalMs,
      Math.ceil(this.adaptiveRequestIntervalMs / 2),
    );
  }

  private extractResultText(
    result: PaddleLayoutParsingResult,
    preserveMetadata = false,
  ) {
    const blocks = result.prunedResult?.parsing_res_list ?? [];
    if (blocks.length === 0) {
      return result.markdown?.text ?? '';
    }

    return blocks
      .filter((block) => preserveMetadata || this.shouldKeepBlock(block))
      .sort(
        (first, second) =>
          this.getBlockOrder(first) - this.getBlockOrder(second),
      )
      .map((block) =>
        preserveMetadata
          ? (block.block_content ?? '').trim()
          : this.cleanBlockText(block.block_content ?? ''),
      )
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

    return normalized
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
    if (
      underscoreCount >= 12 ||
      underscoreCount / Math.max(text.length, 1) > 0.28
    ) {
      return true;
    }

    if (/^学号[:：]?$/.test(compact) || /^姓名[:：]?$/.test(compact)) {
      return true;
    }

    if (
      /^(九|七|八|初|高|[0-9]+)?[一二三四五六七八九十0-9]*年级.*姓名/.test(
        compact,
      )
    ) {
      return true;
    }

    if (
      /^(九|七|八|初|高|[0-9]+)?[一二三四五六七八九十0-9]*年级[一二三四五六七八九十0-9]*班$/.test(
        compact,
      )
    ) {
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

  private parsePositiveInteger(raw: string | undefined, fallback: number) {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
