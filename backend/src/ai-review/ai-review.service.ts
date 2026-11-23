import { Injectable, InternalServerErrorException } from '@nestjs/common';

type EssayReviewResult = {
  summary: string;
  strengths: string;
  issues: string;
  suggestions: string;
  rewriteExample: string;
  scoring: {
    total: number;
    content: number;
    structure: number;
    language: number;
    idea: number;
  };
};

type TopicGuidanceResult = {
  summary: string;
  ideas: string;
  structure: string;
  classroomTips: string;
};

type EssayTextCleanupResult = {
  studentName: string;
  title: string;
  body: string;
  fullText: string;
};

const OCR_REVIEW_RULES = `OCR 容错评阅规则（优先于其他评阅要求）：
1. 作文是由手写原稿转写得到的文本，可能存在错认字、漏字、多字、涂改残留和断句错误。你无法核对原稿，不能区分学生笔误与识别错误；对局部不通顺、词义突兀或字词残缺，一律按可能的识别噪声略过，依据能够确认的上下文理解全文，不归因于学生。
2. 所有输出字段都不指出错别字、病句、标点错误或个别词语使用错误；不要求改某个字、删某个字或逐句润色，不引用、复述疑似识别错误的片段作为批评证据，也不声称学生没有错别字。
3. 不因上述局部噪声降低总分或语言分，不据此认定学生表达能力差、句子残缺、作文未完成或偏题。语言分依据可靠上下文中可以确认的叙述表现、描写效果和整体表达风格判断；其他扣分也必须有明确的整体内容依据。
4. 存在问题和修改建议聚焦扣题、选材、立意、结构。只根据能够确认的主要事件、中心、段落关系和结尾提出判断；不把疑似识别造成的词句问题包装成选材、结构或立意问题。不确定的判断直接略过，宁可少写，也不要凑出问题。
5. 评语将直接打印给学生，不能出现 OCR、识别错误、模型、字迹潦草、原稿难辨等内部处理说明，也不能把你根据上下文猜出的字句当作学生原句。
6. 输出前逐项自查 summary、strengths、issues、suggestions、rewriteExample 和评分依据，删除字词纠错、疑似错文引用及基于局部不通顺的负面评价；不要输出自查过程。`;

@Injectable()
export class AiReviewService {
  private readonly baseUrl =
    process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
  private readonly apiKey = process.env.DEEPSEEK_API_KEY ?? '';
  private readonly model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

  async generateTopicGuidance(input: {
    taskName?: string;
    topicText: string;
  }): Promise<TopicGuidanceResult> {
    const content = await this.chat([
      {
        role: 'system',
        content:
          '你是一名资深初中语文教师教研助手。请严格输出 JSON，不要输出 markdown 代码块。',
      },
      {
        role: 'user',
        content: `请基于以下“作文题目与材料”生成教师课堂可直接使用的讲解思路，返回 JSON，字段必须为 summary、ideas、structure、classroomTips。

要求：
1. 讲解对象是“作文题目与材料”本身，不要把任务名称当成作文题目。
2. 如果提供了任务名称，它只表示本次作业或考试名称，例如“期中考试”“第一次月考”，不能代替作文题。
3. 请重点分析审题、立意方向、可写素材、结构安排和课堂讲解提示。

任务名称：${input.taskName ?? '未提供'}
作文题目与材料：
${input.topicText}`,
      },
    ]);

    const parsed = this.parseJson(content);
    return {
      summary: this.asString(parsed.summary),
      ideas: this.asString(parsed.ideas),
      structure: this.asString(parsed.structure),
      classroomTips: this.asString(parsed.classroomTips),
    };
  }

  async generateEssayReview(input: {
    taskTitle: string;
    topicText?: string | null;
    topicGuidance?: TopicGuidanceResult | Record<string, unknown> | null;
    studentName?: string | null;
    className?: string | null;
    essayText: string;
  }): Promise<EssayReviewResult> {
    const topicGuidanceText = this.formatTopicGuidance(input.topicGuidance);
    const content = await this.chat([
      {
        role: 'system',
        content: `你是一名严谨的中考语文作文批改助手，评语面向学生并会直接打印。你必须只返回一个 JSON 对象，不要输出 markdown，不要解释，不要补充任何字段。

${OCR_REVIEW_RULES}`,
      },
      {
        role: 'user',
        content: `请按照真实中考语文作文阅卷习惯，对以下作文进行整体批改与评分，并严格按要求返回 JSON。

容错示例（只用于理解规则，不是本篇作文内容，不得写入评语）：
- “总希望”可能被转写成“恶希望”，这种单字突兀不能作为错别字、用词不当或表达不通顺的问题指出。
- “漆面光亮如镜”可能因涂改残留被转写成“漆面光亮如望镜”，不要建议删除“望”，也不要引用这段转写文字进行改句。
- 对类似情况，跳过不能确认的局部，继续评价全文的扣题、选材、立意和结构。不要在评语中解释你跳过了哪些文字。

评分校准要求：
1. 采用 50 分制，总分仍按“整体印象分”来定，不要按机械加减分公式评分。
2. 对于一篇完整、基本切题、表达普通但没有明显硬伤的作文，常见分数应在 36-38 分之间，默认基准可理解为 38 分左右。
3. 明显优秀、立意或语言较突出的作文，通常在 40-42 分；42 分以上非常少见，只有在明显出众时才使用。
4. 明显较差、问题较多但基本写完的作文，一般在 31-35 分。
5. 没写完、明显跑题、内容非常空泛或质量很差的作文，才给 30 分左右或低于 30 分。
6. 当前依据 OCR 转写文本评分，不评价字迹、卷面、错别字和标点，不因局部句子残缺、个别词语突兀或表达不通顺扣总分或语言分。主要依据可确认的整体扣题程度、材料支撑、结构安排和立意深度评分；语言仅评价可靠上下文体现的整体表现力。
7. 除总分外，还要给出四个展示用子项分：内容（20分）、结构（10分）、语言（10分）、立意（10分）。这四项是为了展示解释评分，不是机械公式来源，但最终返回时四项之和必须等于总分。

前置解题思路使用要求：
1. 下方“题目解题思路”来自前一步 AI 对作文题目的审题、立意和结构分析，必须作为重要参照。
2. 评分时要结合题目解题思路判断学生作文是否切题、立意是否准确、材料选择是否服务中心、结构安排是否贴合题目要求。
3. 评语应结合明确的主要事件、段落关系和中心表达，指出与题意的贴合点；只有存在可靠的整体内容依据时才指出偏差，不根据疑似识别噪声推断偏题。
4. 题目解题思路只作为阅卷参照，不要照搬成学生作文内容，也不要因为学生没有完全按该思路写就机械扣分；只要立意合理、能自洽切题，也应认可。

输出字段要求：
1. summary：80-120字，从整体扣题程度、主要材料、中心与结构评价完成情况，不评价局部字词正误。
2. strengths：根据可以确认的内容写2-3个主要优点，合为一段话，不要分点符号；依据不足时可以少写。
3. issues：仅从扣题、选材、立意、结构中指出有明确依据的主要问题，合为一段话；不必覆盖每个方面，不凑数量，不出现字词、病句或局部表达不通顺的批评。若没有可以确认的整体问题，直接写“暂无明确的整体性问题。”
4. suggestions：围绕扣题、选材、立意、结构，选择最需要提升的2-3个方面给出具体可执行的建议，依据不足时可以少写。可采用“扣题：……”“选材：……”“立意：……”“结构：……”的分行形式，说明应突出哪个中心、充实哪类已有事件细节、如何安排详略或前后照应。不要采用“原句—修改—说明”的逐句改写格式，不纠正个别字词，不要求修改疑似识别噪声。
5. rewriteExample：以原文中能够确认的事件和中心为依据，给出一个120-180字的细节展开、段落组织或点题示例；不引用疑似错文，不逐字纠错，不虚构新人物或新事件。可靠内容不足以支持示例时返回空字符串。
6. scoreTotal：必须是数字，表示 0-50 的最终总分。
7. scoreContent：必须是数字，范围 0-20。
8. scoreStructure：必须是数字，范围 0-10。
9. scoreLanguage：必须是数字，范围 0-10。
10. scoreIdea：必须是数字，范围 0-10。

硬性要求：
- 所有字段都必须返回。
- summary、strengths、issues、suggestions、rewriteExample 必须是字符串。
- scoreTotal、scoreContent、scoreStructure、scoreLanguage、scoreIdea 都必须是数字，不要返回字符串。
- 不要返回数组，不要返回对象嵌套，不要补充其他字段。
- 不要出现“作为AI”等表述。
- 分数要符合真实阅卷手感：普通完整作文不要轻易打到 32 分以下，优秀作文不要轻易超过 42 分。
- 只有可靠的整体内容足以确认作文未完成时，才相应降低评分；不能因局部漏字、断句或转写噪声认定未完成。
- 四个子项分必须加起来等于 scoreTotal，并且能合理反映内容、结构、语言、立意的强弱差异。
- 所有字段均须遵守系统中的 OCR 容错评阅规则；不能把识别噪声归为学生的写作错误，也不能在打印评语中说明识别过程。

作文任务：${input.taskTitle}
作文题目原文：${input.topicText ?? '未提供'}
题目解题思路：
${topicGuidanceText || '未提供'}
学生姓名：${input.studentName ?? '未知'}
班级：${input.className ?? '未知'}
作文正文：
${input.essayText}

返回格式示例：
{"summary":"...","strengths":"...","issues":"...","suggestions":"扣题：……；选材：……；结构：……","rewriteExample":"...","scoreTotal":38,"scoreContent":15,"scoreStructure":8,"scoreLanguage":7,"scoreIdea":8}
`,
      },
    ]);

    const parsed = this.parseJson(content);
    const wordCount = this.estimateWordCount(input.essayText);
    const totalScore = this.normalizeHolisticScore(
      parsed.scoreTotal,
      wordCount,
    );
    const dimensionScores = this.normalizeDimensionScores(totalScore, {
      content: parsed.scoreContent,
      structure: parsed.scoreStructure,
      language: parsed.scoreLanguage,
      idea: parsed.scoreIdea,
    });

    return {
      summary:
        this.pickString(parsed, ['summary', 'overall', 'comment']) ||
        '暂未形成可靠的整体评价。',
      strengths:
        this.pickString(parsed, ['strengths', 'advantages', 'highlights']) ||
        '暂未形成有充分依据的优点分析。',
      issues:
        this.pickString(parsed, ['issues', 'problems', 'weaknesses']) ||
        '暂无充分依据指出整体性问题。',
      suggestions:
        this.pickString(parsed, [
          'suggestions',
          'revisionSuggestions',
          'advice',
        ]) ||
        '可从扣题、选材、立意和结构四个方面检查作文：明确回应题意，选择能支撑中心的事件，安排好段落详略，并让结尾与主题呼应。',
      rewriteExample:
        this.pickString(parsed, [
          'rewriteExample',
          'example',
          'sampleRewrite',
        ]) || '',
      scoring: {
        total: totalScore,
        content: dimensionScores.content,
        structure: dimensionScores.structure,
        language: dimensionScores.language,
        idea: dimensionScores.idea,
      },
    };
  }

  async cleanupOcrEssayText(input: {
    rawText: string;
  }): Promise<EssayTextCleanupResult> {
    const rawText = input.rawText.trim();
    if (!rawText) {
      return { studentName: '', title: '', body: '', fullText: '' };
    }
    // Compact worksheet ruling without discarding header text or essay words.
    const promptText = rawText
      .replace(/[_＿]{2,}/g, ' ')
      .replace(/[—-]{6,}/g, ' ')
      .replace(/[ \t]{2,}/g, ' ');

    const content = await this.chat([
      {
        role: 'system',
        content:
          '你只从完整作文 OCR 文本中提取页眉学生姓名、标题和正文，返回包含 studentName、title、body 的 JSON 对象。姓名只能取自页眉或姓名栏，不能从正文人物中推断作者。忠实保留正文原文，不改写、纠错或补写。',
      },
      {
        role: 'user',
        content: `请从下面的完整 OCR 文本中同时提取页眉学生姓名、作文标题和正文。

处理规则：
1. 先从页眉或独立的姓名栏提取学生姓名到 studentName；允许合并姓名之间的排版空白，去除包裹姓名的 HTML 或 LaTex 排版标签。只保留 OCR 实际出现的姓名文字，不纠正姓名中的错认字，不补字、不猜测；找不到或存在多个无法确定的作者姓名时返回空字符串。正文中的人物姓名不能当成作者姓名。
2. 正文中仅删除独立的姓名、班级、学号、日期、作文纸名称、页眉页脚、字数刻度及残留纸张模板符号；这些词若出现在正文句子中则保留。姓名和其他页眉信息不要混入 title、body。
3. 明确的作文标题放入 title；不能确认时返回空字符串。
4. 按原顺序保留正文的字词、标点和自然段。只合并同一段内由 OCR 造成的断行，不调整段落顺序，不猜测或修正错字，不概括或缩写正文。
5. 只返回字符串字段 studentName、title、body，不要返回其他字段、markdown 或解释。

OCR文本：
${promptText}

返回示例：
{"studentName":"","title":"我的未来不是梦","body":"……"}`,
      },
    ]);

    const parsed = this.parseJson(content);
    const proposedName = this.asString(parsed.studentName).replace(/\s/g, '');
    const nameSource = rawText
      .replace(/<[^>]*>/g, '')
      .replace(/\\(?:underline|text|mathrm|textbf)\s*\{/gu, '')
      .replace(/[{}$\s_＿|*`]/g, '');
    const studentName =
      /^[\p{Script=Han}·]{2,6}$/u.test(proposedName) &&
      !/年级|班级|姓名|学号|成绩|作文|活页|日期/u.test(proposedName) &&
      nameSource.includes(proposedName)
        ? proposedName
        : '';
    const title = this.asString(parsed.title)
      .replace(/^#+\s*/, '')
      .trim();
    const body = this.asString(parsed.body).trim();
    const fullText = [title, body].filter(Boolean).join('\n\n').trim();

    return {
      studentName,
      title,
      body,
      fullText,
    };
  }

  private async chat(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        '缺少 DEEPSEEK_API_KEY，无法调用 AI 服务',
      );
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new InternalServerErrorException(
        `DeepSeek 调用失败：${response.status} ${text}`,
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return json.choices?.[0]?.message?.content?.trim() ?? '{}';
  }

  private parseJson(content: string): Record<string, unknown> {
    const cleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch (_error) {
      throw new InternalServerErrorException('AI 返回结果不是有效 JSON');
    }
  }

  private pickString(value: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const candidate = value[key];
      const normalized = this.asString(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  private formatTopicGuidance(
    value?: TopicGuidanceResult | Record<string, unknown> | null,
  ) {
    const guidance = this.asRecord(value);
    const parts = [
      ['题目理解', this.pickString(guidance, ['summary'])],
      ['立意方向', this.pickString(guidance, ['ideas'])],
      ['结构建议', this.pickString(guidance, ['structure'])],
      ['讲解提示', this.pickString(guidance, ['classroomTips'])],
    ]
      .filter(([, content]) => content)
      .map(([label, content]) => `${label}：${content}`);

    return parts.join('\n');
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private asString(value: unknown) {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.asString(item))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (value && typeof value === 'object') {
      return Object.entries(value)
        .map(([key, item]) => `${key}：${this.asString(item)}`)
        .filter((item) => item !== '：')
        .join('\n')
        .trim();
    }

    return '';
  }

  private clampInt(value: unknown, min: number, max: number, fallback = min) {
    const raw =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : fallback;
    if (!Number.isFinite(raw)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(raw)));
  }

  private estimateWordCount(text: string) {
    return text.replace(/\s/g, '').length;
  }

  private normalizeHolisticScore(value: unknown, wordCount: number) {
    let score = this.clampInt(value, 0, 50, 37);

    if (wordCount < 200) {
      return Math.min(score, 18);
    }
    if (wordCount < 300) {
      return Math.min(score, 24);
    }
    if (wordCount < 400) {
      return Math.min(score, 30);
    }

    if (wordCount >= 500 && score < 31) {
      score = 31;
    }
    if (wordCount >= 550 && score < 33) {
      score = 33;
    }

    return Math.min(score, 42);
  }

  private normalizeDimensionScores(
    total: number,
    raw: {
      content: unknown;
      structure: unknown;
      language: unknown;
      idea: unknown;
    },
  ) {
    const maxMap = {
      content: 20,
      structure: 10,
      language: 10,
      idea: 10,
    } as const;

    const fallback = this.deriveDimensionFallback(total);
    const draft = {
      content: this.clampInt(raw.content, 0, maxMap.content, fallback.content),
      structure: this.clampInt(
        raw.structure,
        0,
        maxMap.structure,
        fallback.structure,
      ),
      language: this.clampInt(
        raw.language,
        0,
        maxMap.language,
        fallback.language,
      ),
      idea: this.clampInt(raw.idea, 0, maxMap.idea, fallback.idea),
    };

    let current = draft.content + draft.structure + draft.language + draft.idea;

    if (current < total) {
      let gap = total - current;
      const keys: Array<keyof typeof draft> = [
        'content',
        'idea',
        'language',
        'structure',
      ];
      while (gap > 0) {
        let moved = false;
        for (const key of keys) {
          if (draft[key] < maxMap[key]) {
            draft[key] += 1;
            gap -= 1;
            moved = true;
            if (gap === 0) break;
          }
        }
        if (!moved) break;
      }
    } else if (current > total) {
      let overflow = current - total;
      const keys: Array<keyof typeof draft> = [
        'content',
        'language',
        'structure',
        'idea',
      ];
      while (overflow > 0) {
        let moved = false;
        for (const key of keys) {
          if (draft[key] > 0) {
            draft[key] -= 1;
            overflow -= 1;
            moved = true;
            if (overflow === 0) break;
          }
        }
        if (!moved) break;
      }
    }

    current = draft.content + draft.structure + draft.language + draft.idea;
    if (current !== total) {
      draft.content = Math.max(
        0,
        Math.min(maxMap.content, draft.content + (total - current)),
      );
    }

    return draft;
  }

  private deriveDimensionFallback(total: number) {
    const content = Math.max(0, Math.min(20, Math.round(total * 0.4)));
    const structure = Math.max(0, Math.min(10, Math.round(total * 0.2)));
    const language = Math.max(0, Math.min(10, Math.round(total * 0.2)));
    const idea = Math.max(
      0,
      Math.min(10, total - content - structure - language),
    );

    return { content, structure, language, idea };
  }
}
