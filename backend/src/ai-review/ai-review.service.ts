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
  title: string;
  body: string;
  fullText: string;
};

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
    studentName?: string | null;
    className?: string | null;
    essayText: string;
  }): Promise<EssayReviewResult> {
    const content = await this.chat([
      {
        role: 'system',
        content:
          '你是一名严谨的中考语文作文批改助手。你必须只返回一个 JSON 对象，不要输出 markdown，不要解释，不要补充任何字段。',
      },
      {
        role: 'user',
        content: `请按照真实中考语文作文阅卷习惯，对以下作文进行整体批改与评分，并严格按要求返回 JSON。

评分校准要求：
1. 采用 50 分制，总分仍按“整体印象分”来定，不要按机械加减分公式评分。
2. 对于一篇完整、基本切题、表达普通但没有明显硬伤的作文，常见分数应在 36-38 分之间，默认基准可理解为 38 分左右。
3. 明显优秀、立意或语言较突出的作文，通常在 40-42 分；42 分以上非常少见，只有在明显出众时才使用。
4. 明显较差、问题较多但基本写完的作文，一般在 31-35 分。
5. 没写完、明显跑题、内容非常空泛或质量很差的作文，才给 30 分左右或低于 30 分。
6. 当前依据 OCR 转写文本评分，无法准确判断字迹、卷面和部分标点，因此不要因为这些图像因素重扣分；若文本中存在非常明显的句子残缺或严重不通顺，可酌情降低总分。
7. 除总分外，还要给出四个展示用子项分：内容（20分）、结构（10分）、语言（10分）、立意（10分）。这四项是为了展示解释评分，不是机械公式来源，但最终返回时四项之和必须等于总分。

输出字段要求：
1. summary：80-120字，总结作文整体完成度、中心、语言与结构情况。
2. strengths：列出2-3个主要优点，写成一段话，不要分点符号。
3. issues：列出2-4个最主要问题，写成一段话，不要泛泛而谈，要贴合作文内容。
4. suggestions：必须挑选原文中2-3个最典型的句子进行修改建议，格式固定为“原句：…… 修改：…… 说明：……”，各组之间用换行分隔。
5. rewriteExample：基于原文内容，给出一个120-180字的优化示例片段，要求贴合原题，不要脱离原文另起炉灶。
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
- 如果作文明显未完成，分数应显著下调。
- 四个子项分必须加起来等于 scoreTotal，并且能合理反映内容、结构、语言、立意的强弱差异。

作文任务：${input.taskTitle}
作文题目原文：${input.topicText ?? '未提供'}
学生姓名：${input.studentName ?? '未知'}
班级：${input.className ?? '未知'}
作文正文：
${input.essayText}

返回格式示例：
{"summary":"...","strengths":"...","issues":"...","suggestions":"原句：... 修改：... 说明：...","rewriteExample":"...","scoreTotal":38,"scoreContent":15,"scoreStructure":8,"scoreLanguage":7,"scoreIdea":8}
`,
      },
    ]);

    const parsed = this.parseJson(content);
    const wordCount = this.estimateWordCount(input.essayText);
    const totalScore = this.normalizeHolisticScore(parsed.scoreTotal, wordCount);
    const dimensionScores = this.normalizeDimensionScores(totalScore, {
      content: parsed.scoreContent,
      structure: parsed.scoreStructure,
      language: parsed.scoreLanguage,
      idea: parsed.scoreIdea,
    });

    return {
      summary:
        this.pickString(parsed, ['summary', 'overall', 'comment']) ||
        '文章整体完成了基本表达，但仍需进一步打磨中心表达、语言细节与结构层次。',
      strengths:
        this.pickString(parsed, ['strengths', 'advantages', 'highlights']) ||
        '文章有一定的生活素材基础，能围绕题意展开表达，个别细节描写也能体现真实感受。',
      issues:
        this.pickString(parsed, ['issues', 'problems', 'weaknesses']) ||
        '文章目前主要问题在于部分句子表达不够精炼，段落推进略显平直，个别位置的点题和升华还不够集中。',
      suggestions:
        this.pickString(parsed, ['suggestions', 'revisionSuggestions', 'advice']) ||
        '原句：这篇作文还有不少地方需要改。 修改：这篇作文在语言凝练和细节推进上还有进一步优化空间。 说明：把笼统表述改为更具体的修改方向。',
      rewriteExample:
        this.pickString(parsed, ['rewriteExample', 'example', 'sampleRewrite']) ||
        '我再次看向那张旧书桌时，忽然明白，人生并不是一路平坦地向前，而是在一次次磕碰中学会站稳脚步。那些坑洼与划痕，像极了成长留下的印记。正因为经历过磨损，它才更能托住新的日子；也正因为走过曲折，我才更懂得珍惜眼前，继续把人生认真续写下去。',
      scoring: {
        total: totalScore,
        content: dimensionScores.content,
        structure: dimensionScores.structure,
        language: dimensionScores.language,
        idea: dimensionScores.idea,
      },
    };
  }

  async cleanupOcrEssayText(input: { rawText: string }): Promise<EssayTextCleanupResult> {
    const rawText = input.rawText.trim();
    if (!rawText) {
      return { title: '', body: '', fullText: '' };
    }

    const content = await this.chat([
      {
        role: 'system',
        content:
          '你是一名作文 OCR 文本整理助手。你只负责从 OCR 结果中提取作文标题和正文。必须只返回 JSON，不要输出 markdown，不要解释。',
      },
      {
        role: 'user',
        content: `请整理下面的 OCR 文本，只返回作文标题和作文正文。

处理规则：
1. 删除班级、姓名、学号、作文纸名称、页眉页脚、字数标记、温度/编号、公式、空白格线等无关内容。
2. 保留作文真实标题；如果没有明确标题，title 返回空字符串。
3. 正文按自然段合并，修复明显被 OCR 拆开的换行，但不要改写作文内容，不要润色，不要补写。
4. 如果有跨页或左右栏顺序混乱，请根据语义尽量拼接成通顺正文。
5. 只返回字段 title、body，二者都必须是字符串，不要返回其他字段。

OCR文本：
${rawText}

返回示例：
{"title":"我的未来不是梦","body":"……"}`,
      },
    ]);

    const parsed = this.parseJson(content);
    const title = this.asString(parsed.title).replace(/^#+\s*/, '').trim();
    const body = this.asString(parsed.body).trim();
    const fullText = [title, body].filter(Boolean).join('\n\n').trim();

    return {
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

  private asRecord(value: unknown) {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
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

  private clampInt(
    value: unknown,
    min: number,
    max: number,
    fallback = min,
  ) {
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

    let current =
      draft.content + draft.structure + draft.language + draft.idea;

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
    const idea = Math.max(0, Math.min(10, total - content - structure - language));

    return { content, structure, language, idea };
  }
}
