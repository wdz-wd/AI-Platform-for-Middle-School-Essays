import { Logger } from '@nestjs/common';
import { FileKind } from '@prisma/client';
import { TextExtractionService } from './text-extraction.service';

describe('single-pass Paddle extraction', () => {
  const originalProvider = process.env.OCR_PROVIDER;
  const rawText =
    '姓名\n李 景 言\n班级：七年级一班\n续写我的人生\n这是一篇完整的作文正文，写下我的经历与感悟。';
  const body = '续写我的人生\n这是一篇完整的作文正文，写下我的经历与感悟。';

  beforeEach(() => {
    process.env.OCR_PROVIDER = 'paddle';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    if (originalProvider === undefined) delete process.env.OCR_PROVIDER;
    else process.env.OCR_PROVIDER = originalProvider;
    jest.restoreAllMocks();
  });

  function setup() {
    const paddle = {
      isEnabled: () => true,
      recognize: jest.fn().mockResolvedValue({ rawText, fullText: body }),
    };
    const ai = {
      cleanupOcrEssayText: jest
        .fn()
        .mockResolvedValue({ studentName: '李景言', fullText: body }),
    };
    const service = new TextExtractionService(
      {} as never,
      paddle as never,
      ai as never,
    );
    return { paddle, ai, service };
  }

  it('extracts name and essay in one OCR and one AI call with the entire header', async () => {
    const { service, paddle, ai } = setup();
    const checkpoint = { inputHash: 'hash', jobId: 'existing-job' };
    const onOcrProgress = jest.fn().mockResolvedValue(undefined);
    const result = await service.extractText(
      { kind: FileKind.JPG, buffer: Buffer.from('image') },
      {
        waitForOcr: true,
        ocrProgress: { body: checkpoint },
        onOcrProgress,
      },
    );
    expect(paddle.recognize).toHaveBeenCalledTimes(1);
    expect(ai.cleanupOcrEssayText).toHaveBeenCalledTimes(1);
    expect(ai.cleanupOcrEssayText).toHaveBeenCalledWith({ rawText });
    expect(paddle.recognize.mock.calls[0][1].checkpoint).toBe(checkpoint);
    await paddle.recognize.mock.calls[0][1].onCheckpoint(checkpoint);
    expect(onOcrProgress).toHaveBeenCalledWith('body', checkpoint);
    expect(result).toMatchObject({
      text: body,
      ocrRawText: rawText,
      ocrHeaderName: '李景言',
    });
  });

  it('does not send crop requests when no name is present', async () => {
    const { service, paddle, ai } = setup();
    paddle.recognize.mockResolvedValue({ rawText: body, fullText: body });
    ai.cleanupOcrEssayText.mockResolvedValue({
      studentName: '',
      fullText: body,
    });
    const result = await service.extractText(
      { kind: FileKind.PNG, buffer: Buffer.from('image') },
      { waitForOcr: true },
    );
    expect(paddle.recognize).toHaveBeenCalledTimes(1);
    expect(result.ocrHeaderName).toBeNull();
  });

  it('falls back to filtered body and header rules after AI failure without another OCR', async () => {
    const { service, paddle, ai } = setup();
    paddle.recognize.mockResolvedValue({
      rawText: `姓名：李景言\n${body}`,
      fullText: body,
    });
    ai.cleanupOcrEssayText.mockRejectedValue(new Error('AI unavailable'));
    const result = await service.extractText(
      { kind: FileKind.JPG, buffer: Buffer.from('image') },
      { waitForOcr: true },
    );
    expect(result.text).toBe(body);
    expect(result.text).not.toContain('姓名：');
    expect(result.ocrHeaderName).toBe('李景言');
    expect(paddle.recognize).toHaveBeenCalledTimes(1);
  });

  it('uses the same single-pass flow for a scanned PDF', async () => {
    const { service, paddle } = setup();
    jest.spyOn(service, 'extractPdfText').mockResolvedValue('');
    const result = await service.extractText(
      { kind: FileKind.PDF, buffer: Buffer.from('pdf') },
      { waitForOcr: true },
    );
    expect(result.ocrHeaderName).toBe('李景言');
    expect(paddle.recognize).toHaveBeenCalledTimes(1);
  });

  it('keeps source words when AI tries to correct OCR characters', async () => {
    const { service, paddle, ai } = setup();
    paddle.recognize.mockResolvedValue({
      rawText: '姓名：李景言\n我看着风等飞向远方。',
      fullText: '我看着风等飞向远方。',
    });
    ai.cleanupOcrEssayText.mockResolvedValue({
      studentName: '李景言',
      fullText: '我看着风筝飞向远方。',
    });
    const result = await service.extractText(
      { kind: FileKind.JPG, buffer: Buffer.from('image') },
      { waitForOcr: true },
    );
    expect(result.text).toBe('我看着风等飞向远方。');
    expect(result.ocrHeaderName).toBe('李景言');
    expect(paddle.recognize).toHaveBeenCalledTimes(1);
  });
});
