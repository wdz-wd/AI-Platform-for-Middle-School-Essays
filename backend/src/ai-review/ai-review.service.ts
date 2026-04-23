import { Injectable, InternalServerErrorException } from '@nestjs/common';

type EssayReviewResult = {
  summary: string;
  strengths: string;
  issues: string;
  suggestions: string;
  rewriteExample: string;
};

type TopicGuidanceResult = {
  summary: string;
  ideas: string;
  structure: string;
  classroomTips: string;
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
          '你是一名严谨的初中语文作文批改助手。你必须只返回一个 JSON 对象，不要输出 markdown，不要解释，不要补充任何字段。JSON 必须包含且只包含 summary、strengths、issues、suggestions、rewriteExample 五个字段，且五个字段的值都必须是字符串。',
      },
      {
        role: 'user',
        content: `请批改以下初中作文，并严格按要求返回 JSON：

字段要求：
1. summary：80-120字，总结作文整体完成度、中心、语言与结构情况。
2. strengths：列出2-3个主要优点，写成一段话，不要分点符号。
3. issues：列出2-4个最主要问题，写成一段话，不要泛泛而谈，要贴合作文内容。
4. suggestions：必须挑选原文中2-3个最典型的句子进行修改建议，格式固定为“原句：…… 修改：…… 说明：……”，各组之间用换行分隔。
5. rewriteExample：基于原文内容，给出一个120-180字的优化示例片段，要求贴合原题，不要脱离原文另起炉灶。

硬性要求：
- 五个字段都必须返回，不能为空字符串。
- 所有字段值必须是字符串，不要返回数组，不要返回对象。
- 不要打分，不要评级，不要出现“作为AI”等表述。

作文任务：${input.taskTitle}
作文题目原文：${input.topicText ?? '未提供'}
学生姓名：${input.studentName ?? '未知'}
班级：${input.className ?? '未知'}
作文正文：
${input.essayText}

返回格式示例：
{"summary":"...","strengths":"...","issues":"...","suggestions":"原句：... 修改：... 说明：...","rewriteExample":"..."}`,
      },
    ]);

    const parsed = this.parseJson(content);
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
}
