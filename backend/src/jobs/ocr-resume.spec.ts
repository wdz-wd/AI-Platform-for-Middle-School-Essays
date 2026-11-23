import { InternalServerErrorException, Logger } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { OcrRetryableError } from '../text-extraction/ocr-retryable.error';
import { JobsService } from './jobs.service';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('essay')),
}));

describe('durable OCR retry scheduling', () => {
  const originalEnv = { ...process.env };
  const services: JobsService[] = [];
  const output = {
    text: '已经识别出的作文正文，可以正常进入后续的批阅阶段。',
    source: 'PADDLE_OCR',
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
    process.env.OCR_CONCURRENCY = '1';
    process.env.OCR_AUTO_RETRY_BASE_MS = '1000';
    process.env.OCR_AUTO_RETRY_MAX_ATTEMPTS = '2';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const service of services.splice(0)) service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  function database() {
    const rows = new Map(
      ['a', 'b'].map((id) => [
        id,
        {
          id,
          taskId: 'task',
          status: SubmissionStatus.TEXT_EXTRACTING as SubmissionStatus,
          classId: null,
          studentId: null,
          text: null,
          ocrProgress: {} as Record<string, unknown>,
          ocrRetryCount: 0,
          ocrNextRetryAt: null as Date | null,
          ocrLastError: null as string | null,
          task: { classId: 'class', classes: [{ classId: 'class' }] },
          files: [{ filePath: 'essay.jpg', fileType: 'JPG' }],
        },
      ]),
    );
    const db = {
      submission: {
        findFirst: jest.fn(async ({ where, select }) => {
          const row = rows.get(where.id);
          return row
            ? select
              ? { taskId: row.taskId }
              : structuredClone(row)
            : null;
        }),
        findMany: jest.fn(async (args) =>
          args.select?.status
            ? [...rows.values()]
                .filter(
                  (row) => row.status === SubmissionStatus.TEXT_EXTRACTING,
                )
                .map((row) => structuredClone(row))
            : [],
        ),
        update: jest.fn(async ({ where, data }) =>
          Object.assign(rows.get(where.id)!, structuredClone(data)),
        ),
      },
      submissionText: { upsert: jest.fn().mockResolvedValue({}) },
      essayTask: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { rows, db };
  }

  function start(db: object, extraction: object) {
    const service = new JobsService(
      db as never,
      {} as never,
      { toAbsolutePath: () => 'essay.jpg' } as never,
      extraction as never,
    );
    jest
      .spyOn(service, 'enqueueSubmissionReview')
      .mockImplementation(() => undefined);
    services.push(service);
    return service;
  }

  it('persists a checkpoint, releases the slot, and lets another essay proceed', async () => {
    const { db, rows } = database();
    const extraction = {
      extractText: jest
        .fn()
        .mockImplementationOnce(async (_, options) => {
          await options.onOcrProgress('body', {
            inputHash: 'hash',
            jobId: 'remote-a',
          });
          throw new OcrRetryableError('429 限流');
        })
        .mockResolvedValue(output),
    };
    const service = start(db, extraction);
    service.enqueueSubmissionOcr('a');
    service.enqueueSubmissionOcr('b');
    await jest.advanceTimersByTimeAsync(0);
    expect(extraction.extractText).toHaveBeenCalledTimes(2);
    expect(rows.get('a')).toMatchObject({
      status: 'TEXT_EXTRACTING',
      ocrRetryCount: 1,
      ocrLastError: '429 限流',
      ocrNextRetryAt: new Date(1000),
      ocrProgress: { body: { inputHash: 'hash', jobId: 'remote-a' } },
    });
    expect(rows.get('b')?.status).toBe('TEXT_READY');
    expect(service['queues'].ocr.active.size).toBe(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(extraction.extractText).toHaveBeenCalledTimes(3);
    expect(extraction.extractText.mock.calls[2][1].ocrProgress.body.jobId).toBe(
      'remote-a',
    );
    expect(rows.get('a')).toMatchObject({
      status: 'TEXT_READY',
      ocrRetryCount: 0,
      ocrLastError: null,
      ocrNextRetryAt: null,
    });
  });

  it('restores the saved delay and checkpoint after a backend restart', async () => {
    const { db, rows } = database();
    rows.delete('b');
    const failedExtraction = {
      extractText: jest.fn(async (_, options) => {
        await options.onOcrProgress('body', {
          inputHash: 'hash',
          jobId: 'original-job',
        });
        throw new OcrRetryableError('查询暂时失败');
      }),
    };
    const original = start(db, failedExtraction);
    original.enqueueSubmissionOcr('a');
    await jest.advanceTimersByTimeAsync(0);
    original.onModuleDestroy();
    const extraction = { extractText: jest.fn().mockResolvedValue(output) };
    const resumed = start(db, extraction);
    await resumed.onModuleInit();
    await jest.advanceTimersByTimeAsync(999);
    expect(extraction.extractText).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(extraction.extractText).toHaveBeenCalledTimes(1);
    expect(extraction.extractText.mock.calls[0][1].ocrProgress.body.jobId).toBe(
      'original-job',
    );
    expect(rows.get('a')?.status).toBe('TEXT_READY');
  });

  it('stops automatically retrying permanent failures and exhausted tasks', async () => {
    const { db, rows } = database();
    rows.get('b')!.ocrRetryCount = 2;
    rows.get('b')!.ocrProgress = {
      body: { inputHash: 'hash', jobId: 'saved' },
    };
    const extraction = {
      extractText: jest
        .fn()
        .mockRejectedValueOnce(
          new InternalServerErrorException('403 每日额度用尽'),
        )
        .mockRejectedValueOnce(new OcrRetryableError('429 限流')),
    };
    const service = start(db, extraction);
    service.enqueueSubmissionOcr('a');
    service.enqueueSubmissionOcr('b');
    await jest.advanceTimersByTimeAsync(0);
    expect(rows.get('a')?.status).toBe('FAILED');
    expect(rows.get('b')).toMatchObject({
      status: 'FAILED',
      ocrRetryCount: 2,
      ocrNextRetryAt: null,
      ocrProgress: { body: { jobId: 'saved' } },
    });
    expect(service['delayedOcr'].size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not revive a deleted essay or overwrite teacher-saved text', async () => {
    const { db, rows } = database();
    const extraction = {
      extractText: jest.fn().mockRejectedValue(new OcrRetryableError('429')),
    };
    const service = start(db, extraction);
    service.enqueueSubmissionOcr('a');
    service.enqueueSubmissionOcr('b');
    await jest.advanceTimersByTimeAsync(0);
    rows.delete('a');
    rows.get('b')!.status = SubmissionStatus.TEXT_READY;
    await jest.advanceTimersByTimeAsync(1000);
    expect(extraction.extractText).toHaveBeenCalledTimes(2);
    expect(rows.get('b')?.status).toBe('TEXT_READY');
    expect(service['delayedOcr'].size).toBe(0);
  });
});
