import { Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { PaddleOcrCheckpoint, PaddleOcrService } from './paddle-ocr.service';
import { OcrJobExpiredError, OcrRetryableError } from './ocr-retryable.error';

describe('PaddleOcrService async API', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.PADDLE_OCR_API_URL =
      'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
    process.env.PADDLE_OCR_TOKEN = 'test-token';
    process.env.PADDLE_OCR_MODEL = 'PaddleOCR-VL-1.6';
    process.env.PADDLE_OCR_POLL_INTERVAL_MS = '1';
    process.env.PADDLE_OCR_MAX_ATTEMPTS = '2';
    process.env.PADDLE_OCR_REQUEST_INTERVAL_MS = '1';
    process.env.PADDLE_OCR_MAX_RETRIES = '2';
    process.env.PADDLE_OCR_RETRY_BASE_MS = '1';
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('uploads a file, polls the job, and reads every JSONL page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { jobId: 'job-1' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { state: 'running' } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              state: 'done',
              resultUrl: { jsonUrl: 'https://example.com/result.jsonl' },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            JSON.stringify({
              result: {
                layoutParsingResults: [
                  {
                    prunedResult: {
                      parsing_res_list: [
                        {
                          block_label: 'text',
                          block_content: '第一段',
                          block_order: 1,
                        },
                      ],
                    },
                  },
                ],
              },
            }),
            JSON.stringify({
              result: {
                layoutParsingResults: [{ markdown: { text: '第二段' } }],
              },
            }),
          ].join('\n'),
        ),
      );

    const result = await new PaddleOcrService().recognize({
      kind: FileKind.PNG,
      buffer: Buffer.from('fake-image'),
    });

    expect(result.fullText).toContain('第一段');
    expect(result.fullText).toContain('第二段');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs',
    );
    const uploadOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(uploadOptions.headers).toEqual({
      Authorization: 'Bearer test-token',
    });
    const form = uploadOptions.body as FormData;
    expect(form.get('model')).toBe('PaddleOCR-VL-1.6');
    expect(JSON.parse(form.get('optionalPayload') as string)).toEqual({
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useChartRecognition: false,
    });
    expect((form.get('file') as File).name).toBe('essay.png');
    expect(fetchMock.mock.calls[3][0]).toBeInstanceOf(URL);
  });

  it('reports a failed remote job', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { jobId: 'job-2' } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: { state: 'failed', errorMsg: '文件不支持' },
          }),
        ),
      );

    await expect(
      new PaddleOcrService().recognize({
        kind: FileKind.PDF,
        buffer: Buffer.from('bad'),
      }),
    ).rejects.toThrow('文件不支持');
  });

  it('preserves header names and original formatting in raw text while filtering the body', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 0, data: { jobId: 'header-job' } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              state: 'done',
              resultUrl: { jsonUrl: 'https://example.com/header.jsonl' },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              layoutParsingResults: [
                {
                  prunedResult: {
                    parsing_res_list: [
                      {
                        block_label: 'text',
                        block_content: '正文原文。',
                        block_order: 2,
                      },
                      {
                        block_label: 'header',
                        block_content: '姓名：$ \\text{李景言} $',
                        block_order: 0,
                      },
                      {
                        block_label: 'text',
                        block_content: '七年级一班 姓名：李景言',
                        block_order: 1,
                      },
                    ],
                  },
                },
              ],
            },
          }),
        ),
      );
    const result = await new PaddleOcrService().recognize({
      kind: FileKind.JPG,
      buffer: Buffer.from('image'),
    });
    expect(result.rawText).toContain('姓名：$ \\text{李景言} $');
    expect(result.rawText).toContain('七年级一班 姓名：李景言');
    expect(result.rawText.indexOf('姓名')).toBeLessThan(
      result.rawText.indexOf('正文'),
    );
    expect(result.fullText).toBe('正文原文。');
  });

  it('stops polling after the configured number of attempts', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { jobId: 'job-3' } })),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 0, data: { state: 'pending' } })),
        ),
      );

    await expect(
      new PaddleOcrService().recognize({
        kind: FileKind.JPG,
        buffer: Buffer.from('image'),
      }),
    ).rejects.toThrow('任务超时');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('persistent remote-job checkpoints', () => {
    const input = { kind: FileKind.JPG, buffer: Buffer.from('essay') };
    let checkpoint: PaddleOcrCheckpoint | undefined;
    const onCheckpoint = async (value: PaddleOcrCheckpoint) => {
      checkpoint = JSON.parse(JSON.stringify(value)) as PaddleOcrCheckpoint;
    };
    const accepted = () =>
      new Response(JSON.stringify({ code: 0, data: { jobId: 'saved-job' } }));
    const done = () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            state: 'done',
            resultUrl: { jsonUrl: 'https://example.com/result.jsonl' },
          },
        }),
      );
    const text = () =>
      new Response(
        JSON.stringify({
          result: {
            layoutParsingResults: [{ markdown: { text: '完整作文正文' } }],
          },
        }),
      );

    beforeEach(() => {
      jest.useFakeTimers({ now: 0 });
      checkpoint = undefined;
      process.env.PADDLE_OCR_MAX_RETRIES = '1';
    });

    it('resumes the same job in a new service after poll retries are exhausted', async () => {
      fetchMock
        .mockResolvedValueOnce(accepted())
        .mockImplementation(() =>
          Promise.resolve(new Response('limited', { status: 429 })),
        );
      const failed = expect(
        new PaddleOcrService().recognize(input, { onCheckpoint }),
      ).rejects.toBeInstanceOf(OcrRetryableError);
      await jest.runAllTimersAsync();
      await failed;
      expect(checkpoint?.jobId).toBe('saved-job');
      fetchMock
        .mockReset()
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(text());
      const resumed = new PaddleOcrService().recognize(input, {
        checkpoint,
        onCheckpoint,
      });
      await jest.runAllTimersAsync();
      await expect(resumed).resolves.toMatchObject({
        fullText: '完整作文正文',
      });
      expect(fetchMock.mock.calls[0][0]).toContain('/saved-job');
      expect(
        fetchMock.mock.calls.every(([, options]) => options.method !== 'POST'),
      ).toBe(true);
      expect(checkpoint?.completed?.fullText).toBe('完整作文正文');
    });

    it('reuses completed text and invalidates it when the image changes', async () => {
      fetchMock
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(text());
      const first = new PaddleOcrService().recognize(input, { onCheckpoint });
      await jest.runAllTimersAsync();
      await first;
      fetchMock.mockReset();
      await expect(
        new PaddleOcrService().recognize(input, { checkpoint }),
      ).resolves.toMatchObject({ fullText: '完整作文正文' });
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(text());
      const changed = new PaddleOcrService().recognize(
        { ...input, buffer: Buffer.from('different essay') },
        { checkpoint },
      );
      await jest.runAllTimersAsync();
      await changed;
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });

    it('refreshes old filtered completed checkpoints through the same job ID', async () => {
      fetchMock
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(text());
      const first = new PaddleOcrService().recognize(input, { onCheckpoint });
      await jest.runAllTimersAsync();
      await first;
      delete checkpoint!.rawTextVersion;
      fetchMock
        .mockReset()
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(text());
      const refresh = new PaddleOcrService().recognize(input, {
        checkpoint,
        onCheckpoint,
      });
      await jest.runAllTimersAsync();
      await refresh;
      expect(fetchMock.mock.calls[0][0]).toContain('/saved-job');
      expect(
        fetchMock.mock.calls.every(([, options]) => options.method !== 'POST'),
      ).toBe(true);
      expect(checkpoint!.rawTextVersion).toBe(2);
    });

    it.each([503, 200])(
      'resumes failed or incomplete result downloads without another upload (HTTP %s)',
      async (status) => {
        fetchMock
          .mockResolvedValueOnce(accepted())
          .mockResolvedValueOnce(done())
          .mockResolvedValueOnce(new Response('unavailable', { status }));
        const failed = expect(
          new PaddleOcrService().recognize(input, { onCheckpoint }),
        ).rejects.toBeInstanceOf(OcrRetryableError);
        await jest.runAllTimersAsync();
        await failed;
        fetchMock
          .mockReset()
          .mockResolvedValueOnce(done())
          .mockResolvedValueOnce(text());
        const resumed = new PaddleOcrService().recognize(input, {
          checkpoint,
          onCheckpoint,
        });
        await jest.runAllTimersAsync();
        await resumed;
        expect(fetchMock.mock.calls[0][0]).toContain('/saved-job');
        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
    );

    it('keeps a pending remote job after a polling timeout', async () => {
      fetchMock
        .mockResolvedValueOnce(accepted())
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ code: 0, data: { state: 'pending' } }),
            ),
          ),
        );
      const failed = expect(
        new PaddleOcrService().recognize(input, { onCheckpoint }),
      ).rejects.toBeInstanceOf(OcrRetryableError);
      await jest.runAllTimersAsync();
      await failed;
      expect(checkpoint?.jobId).toBe('saved-job');
    });

    it('clears an expired job and only then allows a new submission', async () => {
      fetchMock.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 11002, msg: 'job 已过期' }), {
          status: 400,
        }),
      );
      const failed = expect(
        new PaddleOcrService().recognize(input, { onCheckpoint }),
      ).rejects.toBeInstanceOf(OcrJobExpiredError);
      await jest.runAllTimersAsync();
      await failed;
      expect(checkpoint?.jobId).toBeUndefined();
      fetchMock
        .mockReset()
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(done())
        .mockResolvedValueOnce(text());
      const resumed = new PaddleOcrService().recognize(input, {
        checkpoint,
        onCheckpoint,
      });
      await jest.runAllTimersAsync();
      await resumed;
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });
  });

  describe('shared request pacing and retries', () => {
    const apiUrl = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
    const success = () =>
      new Response(JSON.stringify({ code: 0, data: { jobId: 'accepted' } }));

    beforeEach(() => {
      jest.useFakeTimers({ now: 0 });
      jest.spyOn(Math, 'random').mockReturnValue(0);
      process.env.PADDLE_OCR_REQUEST_INTERVAL_MS = '100';
      process.env.PADDLE_OCR_RETRY_BASE_MS = '5000';
    });

    it('spaces ten concurrent submissions and polls through one gate', async () => {
      const starts: number[] = [];
      let active = 0;
      let peak = 0;
      fetchMock.mockImplementation(async () => {
        starts.push(Date.now());
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 150));
        active--;
        return success();
      });
      const service = new PaddleOcrService();
      const work = Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          service['requestApi'](index % 2 ? `${apiUrl}/job-${index}` : apiUrl, {
            method: index % 2 ? 'GET' : 'POST',
          }),
        ),
      );

      await jest.runAllTimersAsync();
      await work;
      expect(starts).toHaveLength(10);
      expect(peak).toBe(1);
      expect(
        starts.slice(1).every((start, i) => start - starts[i] >= 100),
      ).toBe(true);
    });

    it.each([
      ['HTTP 429', 429, JSON.stringify({ code: 12002, msg: '请求频率过高' })],
      ['non-JSON 429', 429, 'Too many requests'],
      ['API 12002', 200, JSON.stringify({ code: 12002, msg: '请求频率过高' })],
      [
        'queue full',
        503,
        JSON.stringify({ code: 10010, msg: '任务提交队列已满' }),
      ],
    ])(
      'retries an explicitly rejected submission: %s',
      async (_, status, body) => {
        const starts: number[] = [];
        fetchMock.mockImplementation(() => {
          starts.push(Date.now());
          return Promise.resolve(
            starts.length === 1 ? new Response(body, { status }) : success(),
          );
        });
        const work = new PaddleOcrService()['requestApi'](apiUrl, {
          method: 'POST',
          body: new FormData(),
        });
        await jest.runAllTimersAsync();
        await expect(work).resolves.toEqual({ jobId: 'accepted' });
        expect(starts).toEqual([0, 5000]);
      },
    );

    it.each(['20', 'Thu, 01 Jan 1970 00:00:20 GMT'])(
      'shares Retry-After cooldown with other jobs: %s',
      async (retryAfter) => {
        const starts: number[] = [];
        fetchMock.mockImplementation(() => {
          starts.push(Date.now());
          return Promise.resolve(
            starts.length === 1
              ? new Response('rate limited', {
                  status: 429,
                  headers: { 'Retry-After': retryAfter },
                })
              : success(),
          );
        });
        const service = new PaddleOcrService();
        const work = Promise.all([
          service['requestApi'](apiUrl, { method: 'POST' }),
          service['requestApi'](`${apiUrl}/another-job`, {}),
        ]);
        await jest.runAllTimersAsync();
        await work;
        expect(starts).toEqual([0, 20000, 20200]);
      },
    );

    it('retries the same poll without re-uploading or consuming a poll attempt', async () => {
      process.env.PADDLE_OCR_MAX_ATTEMPTS = '1';
      fetchMock
        .mockResolvedValueOnce(success())
        .mockResolvedValueOnce(new Response('limited', { status: 429 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 0,
              data: {
                state: 'done',
                resultUrl: { jsonUrl: 'https://example.com/result.jsonl' },
              },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                layoutParsingResults: [{ markdown: { text: '真实正文' } }],
              },
            }),
          ),
        );
      const work = new PaddleOcrService().recognize({
        kind: FileKind.JPG,
        buffer: Buffer.from('image'),
      });
      await jest.runAllTimersAsync();
      await expect(work).resolves.toMatchObject({ fullText: '真实正文' });
      expect(fetchMock.mock.calls[1][0]).toBe(`${apiUrl}/accepted`);
      expect(fetchMock.mock.calls[2][0]).toBe(`${apiUrl}/accepted`);
      expect(
        fetchMock.mock.calls.filter(([, options]) => options.method === 'POST'),
      ).toHaveLength(1);
    });

    it('retries query network errors and temporary server errors', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(new Response('gateway error', { status: 502 }))
        .mockResolvedValueOnce(success());
      const work = new PaddleOcrService()['requestApi'](
        `${apiUrl}/accepted`,
        {},
      );
      await jest.runAllTimersAsync();
      await expect(work).resolves.toEqual({ jobId: 'accepted' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(Date.now()).toBe(15000);
    });

    it.each([401, 403, 400, 500])(
      'does not blindly repeat a submission on HTTP %s',
      async (status) => {
        fetchMock.mockResolvedValue(new Response('error', { status }));
        const assertion = expect(
          new PaddleOcrService()['requestApi'](apiUrl, { method: 'POST' }),
        ).rejects.toThrow(`提交任务失败：${status}`);
        await jest.runAllTimersAsync();
        await assertion;
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );

    it('does not repeat a submission after an ambiguous network failure', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      const assertion = expect(
        new PaddleOcrService()['requestApi'](apiUrl, { method: 'POST' }),
      ).rejects.toThrow('提交任务请求未完成');
      await jest.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('bounds retries and releases the gate after an exhausted request', async () => {
      const starts: number[] = [];
      fetchMock.mockImplementation(() => {
        starts.push(Date.now());
        return Promise.resolve(new Response('limited', { status: 429 }));
      });
      const service = new PaddleOcrService();
      const assertion = expect(
        service['requestApi'](apiUrl, { method: 'POST' }),
      ).rejects.toThrow('自动重试 2 次后仍未恢复');
      await jest.runAllTimersAsync();
      await assertion;
      expect(starts).toEqual([0, 5000, 15000]);

      fetchMock.mockResolvedValue(success());
      const next = service['requestApi'](`${apiUrl}/next`, {});
      await jest.runAllTimersAsync();
      await expect(next).resolves.toEqual({ jobId: 'accepted' });
      expect(Date.now()).toBe(35000);
    });

    it('shares escalating cooldowns across different jobs on their first rejection', async () => {
      const starts: number[] = [];
      fetchMock.mockImplementation(() => {
        starts.push(Date.now());
        return Promise.resolve(
          starts.length <= 3
            ? new Response('limited', { status: 429 })
            : success(),
        );
      });
      const service = new PaddleOcrService();
      const work = Promise.all(
        [1, 2, 3].map((id) => service['requestApi'](`${apiUrl}/${id}`, {})),
      );
      await jest.runAllTimersAsync();
      await work;
      expect(starts).toEqual([0, 5000, 15000, 35000, 35800, 36600]);
      expect(service['adaptiveRequestIntervalMs']).toBe(800);
    });

    it('slows a sustained batch until the remote request frequency is safe', async () => {
      let lastStart = -Infinity;
      let rejected = 0;
      fetchMock.mockImplementation(() => {
        const gap = Date.now() - lastStart;
        lastStart = Date.now();
        if (gap < 800) {
          rejected++;
          return Promise.resolve(new Response('limited', { status: 429 }));
        }
        return Promise.resolve(success());
      });
      const service = new PaddleOcrService();
      const work = Promise.all(
        Array.from({ length: 20 }, (_, id) =>
          service['requestApi'](`${apiUrl}/${id}`, {}),
        ),
      );
      await jest.runAllTimersAsync();
      await expect(work).resolves.toHaveLength(20);
      expect(rejected).toBe(3);
      expect(service['adaptiveRequestIntervalMs']).toBe(800);
    });

    it('caps adaptive pacing and only recovers after twenty successful requests', async () => {
      const service = new PaddleOcrService();
      for (let retry = 0; retry < 12; retry++) {
        service['retryOrThrow'](0, '提交任务', '429', null, true);
      }
      expect(service['adaptiveRequestIntervalMs']).toBe(30000);
      for (let count = 0; count < 19; count++) {
        service['recordSuccessfulRequest']();
      }
      expect(service['adaptiveRequestIntervalMs']).toBe(30000);
      service['recordSuccessfulRequest']();
      expect(service['adaptiveRequestIntervalMs']).toBe(15000);
      expect(service['throttleStreak']).toBe(0);
    });
  });
});
