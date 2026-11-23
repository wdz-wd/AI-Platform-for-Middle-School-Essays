import { AiReviewService } from './ai-review.service';

describe('AiReviewService OCR-tolerant reviews', () => {
  let originalKey: string | undefined;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const essayText = `续写我的人生\n我恶希望能帮爷爷修好那张旧桌子。漆面光亮如望镜。\n${'我和爷爷一起修理旧桌子，在一次次尝试中学会耐心，也明白继续努力的意义。'.repeat(20)}`;
  const review = {
    summary:
      '文章以修理旧桌子的经历回应成长主题，主要事件完整，结尾能够联系个人感悟。',
    strengths: '围绕修理旧桌子的具体经历展开，能体现由急躁到耐心的变化。',
    issues: '结尾的成长感悟可以进一步与前文的尝试过程形成照应。',
    suggestions:
      '选材：突出一次失败后重新尝试的过程。\n结构：在结尾回应前文的关键行动。',
    rewriteExample: '',
    scoreTotal: 38,
    scoreContent: 15,
    scoreStructure: 8,
    scoreLanguage: 7,
    scoreIdea: 8,
  };

  beforeEach(() => {
    originalKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  function respond(value: object) {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(value) } }],
        }),
      ),
    );
  }

  it('sends the tolerance policy at system priority and retains the printable string contract', async () => {
    respond(review);
    const result = await new AiReviewService().generateEssayReview({
      taskTitle: '作文测试',
      topicText: '续写我的人生',
      essayText,
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[0].content).toContain(
      '不因上述局部噪声降低总分或语言分',
    );
    expect(request.messages[1].content).toContain(essayText);
    expect(request.messages[1].content).not.toContain(
      '必须挑选原文中2-3个最典型的句子',
    );
    expect(request.messages[1].content).not.toContain(
      '严重不通顺，可酌情降低总分',
    );
    expect(result.suggestions).toBe(review.suggestions);
    expect(result.issues).toBe(review.issues);
    expect(result.rewriteExample).toBe('');
    expect(result.scoring).toEqual({
      total: 38,
      content: 15,
      structure: 8,
      language: 7,
      idea: 8,
    });
  });

  it('does not invent source quotations or sentence corrections when review fields are missing', async () => {
    respond({ scoreTotal: 38 });
    const result = await new AiReviewService().generateEssayReview({
      taskTitle: '作文测试',
      essayText,
    });
    expect(result.rewriteExample).toBe('');
    expect(result.issues).toBe('暂无充分依据指出整体性问题。');
    expect(result.suggestions).toContain('扣题、选材、立意和结构');
    expect(JSON.stringify(result)).not.toMatch(
      /原句：|修改：|恶希望|光亮如望镜|错别字|不通顺/,
    );
    expect(
      result.scoring.content +
        result.scoring.structure +
        result.scoring.language +
        result.scoring.idea,
    ).toBe(result.scoring.total);
  });

  it('keeps OCR text intact during extraction rather than silently replacing uncertain characters', async () => {
    const body = '我恶希望能帮爷爷修好那张旧桌子。漆面光亮如望镜。';
    respond({ title: '续写我的人生', body });
    const result = await new AiReviewService().cleanupOcrEssayText({
      rawText: body,
    });
    expect(result.body).toBe(body);
    expect(result.fullText).toContain(body);
    const request = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[0].content).toContain('不改写、纠错或补写');
  });

  it('extracts the header name and essay together while stripping name markup', async () => {
    respond({
      studentName: '李景言',
      title: '续写我的人生',
      body: '我和爷爷一起修理旧桌子。',
    });
    const result = await new AiReviewService().cleanupOcrEssayText({
      rawText:
        '姓名：$ \\underline{\\text{李 景 言}} $\n续写我的人生\n我和爷爷一起修理旧桌子。',
    });
    expect(result.studentName).toBe('李景言');
    expect(result.fullText).not.toContain('李景言');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects names invented or corrected beyond the actual OCR characters', async () => {
    respond({
      studentName: '周文佳',
      title: '续写我的人生',
      body: '我走在成长的路上。',
    });
    const result = await new AiReviewService().cleanupOcrEssayText({
      rawText: '姓名：周雅\n续写我的人生\n我走在成长的路上。',
    });
    expect(result.studentName).toBe('');
  });

  it('does not accept worksheet labels as a name and compacts ruling in the AI input', async () => {
    respond({
      studentName: '年级班',
      title: '续写人生',
      body: '我走在成长的路上。',
    });
    const result = await new AiReviewService().cleanupOcrEssayText({
      rawText: '___年级___班\n姓名 ___\n续写人生\n我走在成长的路上。',
    });
    expect(result.studentName).toBe('');
    const request = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(request.messages[1].content).not.toContain('___');
    expect(request.messages[1].content).toContain('姓名');
  });
});
