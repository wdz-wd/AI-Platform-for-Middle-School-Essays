import { Logger } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { JobsService } from './jobs.service';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('essay image')),
}));

type Kind = 'ocr' | 'review';
type Processors = {
  processSubmissionOcr: (id: string) => Promise<void>;
  processSubmissionReview: (id: string) => Promise<void>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('JobsService independent queues', () => {
  let originalOcr: string | undefined;
  let originalReview: string | undefined;
  let finish: (() => Promise<void>) | undefined;

  beforeEach(() => {
    originalOcr = process.env.OCR_CONCURRENCY;
    originalReview = process.env.REVIEW_CONCURRENCY;
    process.env.OCR_CONCURRENCY = '2';
    process.env.REVIEW_CONCURRENCY = '2';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await finish?.();
    finish = undefined;
    if (originalOcr === undefined) delete process.env.OCR_CONCURRENCY;
    else process.env.OCR_CONCURRENCY = originalOcr;
    if (originalReview === undefined) delete process.env.REVIEW_CONCURRENCY;
    else process.env.REVIEW_CONCURRENCY = originalReview;
    jest.restoreAllMocks();
  });

  function setup() {
    const prisma = {
      submission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new JobsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const processors = service as unknown as Processors;
    const started: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred<void>>>();
    let finishing = false;
    const run = (kind: Kind, id: string) => {
      const key = `${kind}:${id}`;
      started.push(key);
      if (finishing) return Promise.resolve();
      const gate = deferred<void>();
      gates.set(key, gate);
      return gate.promise;
    };
    jest
      .spyOn(processors, 'processSubmissionOcr')
      .mockImplementation((id) => run('ocr', id));
    jest
      .spyOn(processors, 'processSubmissionReview')
      .mockImplementation((id) => run('review', id));
    finish = async () => {
      finishing = true;
      for (const gate of gates.values()) gate.resolve();
      await flush();
    };
    const enqueue = (kind: Kind, id: string) => {
      if (kind === 'ocr') service.enqueueSubmissionOcr(id);
      else service.enqueueSubmissionReview(id);
    };
    const release = async (kind: Kind, id: string) => {
      gates.get(`${kind}:${id}`)!.resolve();
      await flush();
    };
    return { service, prisma, started, gates, enqueue, release };
  }

  it('uses separate limits and refills each queue in FIFO order', async () => {
    process.env.OCR_CONCURRENCY = '2';
    process.env.REVIEW_CONCURRENCY = '1';
    const h = setup();
    for (const id of ['a', 'b', 'c', 'd']) h.enqueue('ocr', id);
    for (const id of ['a', 'b', 'c']) h.enqueue('review', id);
    expect(h.started).toEqual(['ocr:a', 'ocr:b', 'review:a']);

    await h.release('review', 'a');
    expect(h.started).toEqual(['ocr:a', 'ocr:b', 'review:a', 'review:b']);
    await h.release('ocr', 'b');
    expect(h.started.at(-1)).toBe('ocr:c');
    expect(h.started).not.toContain('ocr:d');
    await h.release('ocr', 'a');
    expect(h.started.at(-1)).toBe('ocr:d');
    expect(h.started).not.toContain('review:c');
  });

  it('honors different positive concurrency settings', () => {
    process.env.OCR_CONCURRENCY = '3';
    process.env.REVIEW_CONCURRENCY = '1';
    const h = setup();
    for (const id of ['a', 'b', 'c', 'd']) {
      h.enqueue('ocr', id);
      h.enqueue('review', id);
    }
    expect(h.started.filter((key) => key.startsWith('ocr:'))).toHaveLength(3);
    expect(h.started.filter((key) => key.startsWith('review:'))).toHaveLength(
      1,
    );
  });

  it.each([undefined, '', '0', 'invalid', '1.5'])(
    'falls back to two slots per queue for configuration %s',
    (value) => {
      if (value === undefined) {
        delete process.env.OCR_CONCURRENCY;
        delete process.env.REVIEW_CONCURRENCY;
      } else {
        process.env.OCR_CONCURRENCY = value;
        process.env.REVIEW_CONCURRENCY = value;
      }
      const h = setup();
      for (const id of ['a', 'b', 'c']) {
        h.enqueue('ocr', id);
        h.enqueue('review', id);
      }
      expect(h.started.filter((key) => key.startsWith('ocr:'))).toHaveLength(2);
      expect(h.started.filter((key) => key.startsWith('review:'))).toHaveLength(
        2,
      );
    },
  );

  it('deduplicates pending and active work within each stage and allows later reruns', async () => {
    process.env.OCR_CONCURRENCY = '1';
    process.env.REVIEW_CONCURRENCY = '1';
    const h = setup();
    for (const kind of ['ocr', 'review'] as const) {
      for (const id of ['a', 'a', 'b', 'b']) h.enqueue(kind, id);
    }
    expect(h.started).toEqual(['ocr:a', 'review:a']);
    await h.release('ocr', 'a');
    await h.release('review', 'a');
    expect(h.started).toEqual(['ocr:a', 'review:a', 'ocr:b', 'review:b']);
    await h.release('ocr', 'b');
    h.enqueue('ocr', 'a');
    expect(h.started.filter((key) => key === 'ocr:a')).toHaveLength(2);
  });

  it('releases the slot after unexpected failures and keeps both queues moving', async () => {
    process.env.OCR_CONCURRENCY = '1';
    process.env.REVIEW_CONCURRENCY = '1';
    const h = setup();
    for (const kind of ['ocr', 'review'] as const) {
      h.enqueue(kind, 'a');
      h.enqueue(kind, 'b');
    }
    h.gates.get('ocr:a')!.reject(new Error('OCR failed'));
    await flush();
    expect(h.started).toEqual(['ocr:a', 'review:a', 'ocr:b']);
    h.gates.get('review:a')!.reject(new Error('Review failed'));
    await flush();
    expect(h.started.at(-1)).toBe('review:b');
    expect(Logger.prototype.error).toHaveBeenCalledTimes(2);
  });

  it('resumes interrupted stages independently in creation order', async () => {
    process.env.OCR_CONCURRENCY = '1';
    process.env.REVIEW_CONCURRENCY = '1';
    const h = setup();
    h.prisma.submission.findMany.mockResolvedValueOnce([
      { id: 'a', status: SubmissionStatus.TEXT_EXTRACTING },
      { id: 'b', status: SubmissionStatus.TEXT_READY },
      { id: 'c', status: SubmissionStatus.TEXT_EXTRACTING },
      { id: 'd', status: SubmissionStatus.AI_PROCESSING },
    ]);
    await h.service.onModuleInit();
    expect(h.prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(h.started).toEqual(['ocr:a', 'review:b']);
    await h.release('review', 'b');
    expect(h.started.at(-1)).toBe('review:d');
    await h.release('ocr', 'a');
    expect(h.started.at(-1)).toBe('ocr:c');
  });

  it('starts and completes the first review while the next essay is still being recognized', async () => {
    process.env.OCR_CONCURRENCY = '1';
    process.env.REVIEW_CONCURRENCY = '1';
    const extracted = {
      text: '这是一篇用于验证流水线衔接的作文正文。'.repeat(5),
      source: 'TEST',
    };
    const firstOcr = deferred<typeof extracted>();
    const secondOcr = deferred<typeof extracted>();
    const review = {
      summary: '评语',
      strengths: '优点',
      issues: '问题',
      suggestions: '建议',
      rewriteExample: '示例',
      scoring: { total: 36, content: 15, structure: 7, language: 7, idea: 7 },
    };
    const reviewGate = deferred<typeof review>();
    const texts = new Map<string, { ocrText: string }>();
    const statuses = new Map<string, SubmissionStatus>();
    const prisma = {
      submission: {
        findFirst: jest.fn(
          async (args: {
            where: { id: string };
            select?: unknown;
            include?: { files?: unknown };
          }) => {
            if (args.select) return { taskId: 'task' };
            return {
              id: args.where.id,
              taskId: 'task',
              studentId: null,
              classId: null,
              files: [{ filePath: 'essay.jpg', fileType: 'JPG' }],
              text: texts.get(args.where.id) ?? null,
              task: {
                title: '作文任务',
                topicText: '作文题',
                topicGuidance: null,
                class: { name: '七年级一班' },
              },
              student: null,
              class: null,
            };
          },
        ),
        update: jest.fn(
          async (args: {
            where: { id: string };
            data: { status: SubmissionStatus };
          }) => {
            statuses.set(args.where.id, args.data.status);
          },
        ),
      },
      submissionText: {
        upsert: jest.fn(
          async (args: {
            where: { submissionId: string };
            create: { ocrText: string };
          }) => {
            texts.set(args.where.submissionId, {
              ocrText: args.create.ocrText,
            });
          },
        ),
      },
      essayTask: { findFirst: jest.fn().mockResolvedValue(null) },
      review: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const ai = { generateEssayReview: jest.fn(() => reviewGate.promise) };
    const extraction = {
      extractText: jest
        .fn()
        .mockImplementationOnce(() => firstOcr.promise)
        .mockImplementationOnce(() => secondOcr.promise),
    };
    const service = new JobsService(
      prisma as never,
      ai as never,
      { toAbsolutePath: () => 'essay.jpg' } as never,
      extraction as never,
    );
    finish = async () => {
      firstOcr.resolve(extracted);
      secondOcr.resolve(extracted);
      reviewGate.resolve(review);
      await flush();
    };
    service.enqueueSubmissionOcr('first');
    service.enqueueSubmissionOcr('second');
    await flush();
    expect(extraction.extractText).toHaveBeenCalledTimes(1);
    expect(ai.generateEssayReview).not.toHaveBeenCalled();

    firstOcr.resolve(extracted);
    await flush();
    expect(extraction.extractText).toHaveBeenCalledTimes(2);
    expect(ai.generateEssayReview).toHaveBeenCalledTimes(1);
    expect(ai.generateEssayReview).toHaveBeenCalledWith(
      expect.objectContaining({ essayText: extracted.text }),
    );
    expect(statuses.get('first')).toBe(SubmissionStatus.AI_PROCESSING);
    expect(statuses.get('second')).toBe(SubmissionStatus.TEXT_EXTRACTING);

    reviewGate.resolve(review);
    await flush();
    expect(statuses.get('first')).toBe(SubmissionStatus.AI_DONE);
    expect(statuses.get('second')).toBe(SubmissionStatus.TEXT_EXTRACTING);
    expect(prisma.review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { submissionId: 'first' } }),
    );
  });
});
