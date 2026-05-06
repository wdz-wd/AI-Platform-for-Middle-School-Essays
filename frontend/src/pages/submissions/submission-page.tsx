import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Lightbulb,
  ListTree,
  MessageCircleWarning,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import {
  ReviewDimensionCards,
  ReviewScorePanel,
} from '../../components/review/score-display'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Textarea } from '../../components/ui/textarea'
import { getSubmissionStatusMeta } from '../../lib/status'
import { assetUrl, formatDate } from '../../lib/utils'
import type { StudentItem, SubmissionDetail } from '../../types/api'

function feedbackClass(tone: 'success' | 'error' | 'info') {
  if (tone === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (tone === 'error') {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function getDimensionComment(
  label: 'content' | 'structure' | 'language' | 'idea',
  score?: number | null,
) {
  if (score == null) return '待生成评分结果'

  const templates = {
    content: [
      '内容偏薄，素材支撑还不够。',
      '内容基本完整，细节还可再充实。',
      '内容较充实，能较好支撑主题。',
      '内容充实，细节具体且真实。',
    ],
    structure: [
      '结构偏松，段落推进还不够清楚。',
      '结构基本完整，层次仍可再理顺。',
      '结构较清晰，过渡基本自然。',
      '结构完整清楚，行文推进自然。',
    ],
    language: [
      '语言较直白，表达还需打磨。',
      '语言基本通顺，个别句子可再精炼。',
      '语言较流畅，表达比较自然。',
      '语言流畅生动，有一定表现力。',
    ],
    idea: [
      '立意偏浅，主题提升还不够。',
      '立意基本明确，还可再深入一步。',
      '立意较明确，能体现一定思考。',
      '立意鲜明，主题表达较有深度。',
    ],
  } as const

  const maxMap = {
    content: 20,
    structure: 10,
    language: 10,
    idea: 10,
  } as const

  const ratio = score / maxMap[label]
  if (ratio >= 0.85) return templates[label][3]
  if (ratio >= 0.7) return templates[label][2]
  if (ratio >= 0.5) return templates[label][1]
  return templates[label][0]
}

const quickComments = [
  '优秀',
  '良好',
  '需改进',
  '鼓励性评语',
] as const

const studentNameCollator = new Intl.Collator('zh-Hans-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

type DimensionKey = 'content' | 'structure' | 'language' | 'idea'

const dimensionMeta: Array<{
  key: DimensionKey
  label: string
  max: number
  icon: typeof FileText
  color: string
}> = [
  {
    key: 'content',
    label: '内容',
    max: 20,
    icon: FileText,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    key: 'structure',
    label: '结构',
    max: 10,
    icon: ListTree,
    color: 'bg-violet-50 text-violet-600',
  },
  {
    key: 'language',
    label: '语言',
    max: 10,
    icon: MessageCircleWarning,
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    key: 'idea',
    label: '立意',
    max: 10,
    icon: Lightbulb,
    color: 'bg-amber-50 text-amber-600',
  },
]

type ScoreDraft = Record<DimensionKey, number>

type AiReviewDraft = {
  aiSummary: string
  aiStrengths: string
  aiIssues: string
  aiSuggestions: string
  aiRewriteExample: string
}

export function SubmissionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [finalComment, setFinalComment] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false)
  const [isAiReviewModalOpen, setIsAiReviewModalOpen] = useState(false)
  const [sourceTab, setSourceTab] = useState<'image' | 'text'>('text')
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft>({
    content: 0,
    structure: 0,
    language: 0,
    idea: 0,
  })
  const [aiReviewDraft, setAiReviewDraft] = useState<AiReviewDraft>({
    aiSummary: '',
    aiStrengths: '',
    aiIssues: '',
    aiSuggestions: '',
    aiRewriteExample: '',
  })
  const lastSyncedTextRef = useRef('')
  const [statusFeedback, setStatusFeedback] = useState<{
    tone: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{
    tone: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  const submissionQuery = useQuery({
    queryKey: ['submission', id],
    queryFn: () => apiFetch<SubmissionDetail>(`/submissions/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'AI_PROCESSING' ||
        status === 'TEXT_READY' ||
        status === 'TEXT_EXTRACTING'
        ? 2000
        : false
    },
  })

  const studentsQuery = useQuery({
    queryKey: ['students', selectedClassId, 'bind'],
    queryFn: () =>
      apiFetch<StudentItem[]>(
        `/students?classId=${selectedClassId}`,
      ),
    enabled: !!selectedClassId,
  })
  const sortedStudents = useMemo(() => {
    return [...(studentsQuery.data ?? [])].sort((a, b) => {
      const nameResult = studentNameCollator.compare(a.name, b.name)
      if (nameResult !== 0) return nameResult
      return (a.studentNo ?? '').localeCompare(b.studentNo ?? '', 'zh-Hans', {
        numeric: true,
      })
    })
  }, [studentsQuery.data])

  const remoteText =
    submissionQuery.data?.text?.correctedText?.trim() ||
    submissionQuery.data?.text?.ocrText?.trim() ||
    ''

  const previewFiles = submissionQuery.data?.files ?? []
  const previewFile = previewFiles[0]
  const wordCount = remoteText.replace(/\s/g, '').length
  const essayTitle =
    remoteText
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 42) ??
    submissionQuery.data?.student?.name ??
    previewFile?.fileName ??
    submissionQuery.data?.detectedName ??
    '作文批改详情'

  const score = submissionQuery.data?.review
    ? {
        total: submissionQuery.data.review.scoreTotal,
        content: submissionQuery.data.review.scoreContent,
        structure: submissionQuery.data.review.scoreStructure,
        language: submissionQuery.data.review.scoreLanguage,
        idea: submissionQuery.data.review.scoreIdea,
      }
    : undefined
  const dimensionComments = {
    content: getDimensionComment('content', score?.content),
    structure: getDimensionComment('structure', score?.structure),
    language: getDimensionComment('language', score?.language),
    idea: getDimensionComment('idea', score?.idea),
  }
  const scoreDraftTotal =
    scoreDraft.content +
    scoreDraft.structure +
    scoreDraft.language +
    scoreDraft.idea

  const openScoreModal = () => {
    setScoreDraft({
      content: score?.content ?? 0,
      structure: score?.structure ?? 0,
      language: score?.language ?? 0,
      idea: score?.idea ?? 0,
    })
    setIsScoreModalOpen(true)
  }

  const openAiReviewModal = () => {
    const review = submissionQuery.data?.review
    setAiReviewDraft({
      aiSummary: review?.aiSummary ?? '',
      aiStrengths: review?.aiStrengths ?? '',
      aiIssues: review?.aiIssues ?? '',
      aiSuggestions: review?.aiSuggestions ?? '',
      aiRewriteExample: review?.aiRewriteExample ?? '',
    })
    setIsAiReviewModalOpen(true)
  }
  const previewTextTitle =
    remoteText
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 36) ?? '作文原文'
  const previewTextBody = remoteText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)

  useEffect(() => {
    if (!submissionQuery.data) return

    if (!text.trim() || text === lastSyncedTextRef.current) {
      setText(remoteText)
    }
    lastSyncedTextRef.current = remoteText
    setSelectedClassId(
      submissionQuery.data.class?.id ??
        submissionQuery.data.student?.classId ??
        (submissionQuery.data.task.classes?.length === 1
          ? submissionQuery.data.task.classes[0].id
          : '') ??
        '',
    )
    setStudentId(submissionQuery.data.student?.id ?? '')
    setFinalComment(
      submissionQuery.data.review?.finalComment ??
        submissionQuery.data.review?.teacherComment ??
        '',
    )
  }, [remoteText, submissionQuery.data, text])

  useEffect(() => {
    const status = submissionQuery.data?.status
    if (status === 'TEXT_EXTRACTING') {
      setStatusFeedback({
        tone: 'info',
        message: '系统正在调用百度 OCR 识别正文，请稍等 5-15 秒。',
      })
      return
    }

    if (status === 'AI_PROCESSING') {
      setStatusFeedback({
        tone: 'info',
        message: '系统正在后台生成评语，请稍等 2-10 秒。',
      })
      return
    }

    if (status === 'AI_DONE' || status === 'REVIEWED') {
      setStatusFeedback({
        tone: 'success',
        message: 'AI 评语已生成，可以继续调整教师评语或直接打印。',
      })
      return
    }

    if (status === 'FAILED') {
      setStatusFeedback({
        tone: 'error',
        message: '本次生成失败，请检查 AI 密钥或稍后重新生成。',
      })
      return
    }

    setStatusFeedback(null)
  }, [submissionQuery.data?.status])

  const saveTextMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/submissions/${id}/text`, {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      }),
    onSuccess: async () => {
      lastSyncedTextRef.current = text
      setActionFeedback({
        tone: 'success',
        message: '正文已保存。现在可以点击“重新生成评语”。',
      })
      await queryClient.invalidateQueries({ queryKey: ['submission', id] })
      await queryClient.invalidateQueries({ queryKey: ['task'] })
    },
    onError: (error) => {
      setActionFeedback({
        tone: 'error',
        message: `保存正文失败：${(error as Error).message}`,
      })
    },
  })

  const bindStudentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/submissions/${id}/student-binding`, {
        method: 'PATCH',
        body: JSON.stringify({
          classId: selectedClassId || null,
          studentId: studentId || null,
        }),
      }),
    onSuccess: async () => {
      setActionFeedback({
        tone: 'success',
        message: '学生绑定已更新。',
      })
      await queryClient.invalidateQueries({ queryKey: ['submission', id] })
    },
    onError: (error) => {
      setActionFeedback({
        tone: 'error',
        message: `绑定学生失败：${(error as Error).message}`,
      })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: () => apiFetch(`/submissions/${id}/review`, { method: 'POST' }),
    onSuccess: async () => {
      setActionFeedback({
        tone: 'info',
        message: '已提交后台批改任务，系统正在生成评语...',
      })
      await queryClient.invalidateQueries({ queryKey: ['submission', id] })
      await queryClient.invalidateQueries({ queryKey: ['task'] })
    },
    onError: (error) => {
      setActionFeedback({
        tone: 'error',
        message: `生成评语失败：${(error as Error).message}`,
      })
    },
  })

  const finalMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/reviews/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacherComment: finalComment,
          finalComment,
        }),
      }),
    onSuccess: async () => {
      setActionFeedback({
        tone: 'success',
        message: '教师终稿已保存。',
      })
      await queryClient.invalidateQueries({ queryKey: ['submission', id] })
      await queryClient.invalidateQueries({ queryKey: ['task'] })
      await queryClient.invalidateQueries({ queryKey: ['archive'] })
    },
    onError: (error) => {
      setActionFeedback({
        tone: 'error',
        message: `保存终稿失败：${(error as Error).message}`,
      })
    },
  })

  const scoreMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/reviews/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          scoreContent: scoreDraft.content,
          scoreStructure: scoreDraft.structure,
          scoreLanguage: scoreDraft.language,
          scoreIdea: scoreDraft.idea,
        }),
      }),
    onSuccess: async () => {
      setIsScoreModalOpen(false)
      setActionFeedback({
        tone: 'success',
        message: '评分已更新，四维评语、总分和雷达图已同步刷新。',
      })
      await queryClient.invalidateQueries({ queryKey: ['submission', id] })
      await queryClient.invalidateQueries({ queryKey: ['task'] })
      await queryClient.invalidateQueries({ queryKey: ['archive'] })
    },
    onError: (error) => {
      setActionFeedback({
        tone: 'error',
        message: `保存评分失败：${(error as Error).message}`,
      })
    },
  })

  const aiReviewMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/reviews/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(aiReviewDraft),
      }),
    onSuccess: async () => {
      setIsAiReviewModalOpen(false)
      setActionFeedback({
        tone: 'success',
        message: '结构化评语已更新。',
      })
      await queryClient.invalidateQueries({ queryKey: ['submission', id] })
      await queryClient.invalidateQueries({ queryKey: ['task'] })
      await queryClient.invalidateQueries({ queryKey: ['archive'] })
    },
    onError: (error) => {
      setActionFeedback({
        tone: 'error',
        message: `保存结构化评语失败：${(error as Error).message}`,
      })
    },
  })

  const navigation = useMemo(() => {
    const submissions = submissionQuery.data?.task.submissions ?? []
    const currentIndex = submissions.findIndex((item) => item.id === id)
    return {
      prev: currentIndex > 0 ? submissions[currentIndex - 1] : null,
      next:
        currentIndex >= 0 && currentIndex < submissions.length - 1
          ? submissions[currentIndex + 1]
          : null,
    }
  }, [id, submissionQuery.data?.task.submissions])

  const feedback = actionFeedback ?? statusFeedback

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-stone-400">
        <span>首页</span>
        <span>›</span>
        <span>作文批改</span>
        <span>›</span>
        <span className="font-semibold text-stone-600">批改详情</span>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-black tracking-tight text-ink">{essayTitle}</h1>
            <Badge
              tone={
                submissionQuery.data?.status
                  ? getSubmissionStatusMeta(submissionQuery.data.status).tone
                  : 'neutral'
              }
            >
              {submissionQuery.data?.status
                ? getSubmissionStatusMeta(submissionQuery.data.status).label
                : '加载中'}
            </Badge>
            {feedback ? (
              <div
                className={`rounded-xl border px-4 py-2.5 text-sm ${feedbackClass(feedback.tone)}`}
              >
                {feedback.message}
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-500">
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-accent">
              {submissionQuery.data?.class?.name ?? '未指定班级'}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-accent">
              {submissionQuery.data?.student?.name ?? '未绑定学生'}
            </span>
            {submissionQuery.data?.student?.studentNo ? (
              <span>学号：{submissionQuery.data.student.studentNo}</span>
            ) : null}
            <span>提交时间：{submissionQuery.data ? formatDate(submissionQuery.data.createdAt ?? '') : '--'}</span>
            <span>字数：{wordCount || '--'} 字</span>
            <select
              className="h-10 min-w-[180px] rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value)
                setStudentId('')
              }}
            >
              <option value="">选择班级</option>
              {submissionQuery.data?.task.classes?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 min-w-[220px] rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
              disabled={!selectedClassId}
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">
                {selectedClassId ? '暂不绑定学生' : '请先选择班级'}
              </option>
              {sortedStudents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.studentNo ? `(${item.studentNo})` : ''}
                </option>
              ))}
            </select>
            <Button
              disabled={bindStudentMutation.isPending}
              variant="secondary"
              onClick={() => bindStudentMutation.mutate()}
            >
              保存绑定
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {navigation.prev ? (
            <Button
              variant="secondary"
              onClick={() => navigate(`/submissions/${navigation.prev?.id}`)}
            >
              <ChevronLeft className="mr-1 size-4" />
              上一篇
            </Button>
          ) : null}
          {navigation.next ? (
            <Button
              variant="secondary"
              onClick={() => navigate(`/submissions/${navigation.next?.id}`)}
            >
              下一篇
              <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => navigate(`/tasks/${submissionQuery.data?.task.id ?? ''}`)}
          >
            <ArrowLeft className="mr-1 size-4" />
            返回列表
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr_1fr]">
        <Card className="overflow-hidden rounded-xl p-0">
          <div className="border-b border-stone-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">作文原文</h2>
                <p className="mt-1 text-sm text-stone-500">支持切换原稿图片与提取文字</p>
              </div>
              <div className="flex rounded-xl bg-stone-100 p-1">
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    sourceTab === 'text'
                      ? 'bg-white text-accent shadow-sm'
                      : 'text-stone-500'
                  }`}
                  type="button"
                  onClick={() => setSourceTab('text')}
                >
                  <FileText className="mr-1 inline size-4" />
                  提取文字
                </button>
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    sourceTab === 'image'
                      ? 'bg-white text-accent shadow-sm'
                      : 'text-stone-500'
                  }`}
                  type="button"
                  onClick={() => setSourceTab('image')}
                >
                  <ImageIcon className="mr-1 inline size-4" />
                  原稿图片
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            {sourceTab === 'image' ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  {previewFile?.fileType === 'PDF' ? (
                    <button
                      className="block w-full cursor-zoom-in rounded-xl bg-white p-2"
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                    >
                      <iframe
                        className="pointer-events-none h-[700px] w-full rounded-xl bg-white"
                        src={assetUrl(previewFile.publicUrl)}
                        title="作文预览"
                      />
                    </button>
                  ) : previewFile ? (
                    <button
                      className="block w-full cursor-zoom-in rounded-xl bg-white p-2"
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                    >
                      <img
                        alt="作文原稿"
                        className="max-h-[700px] w-full rounded-xl object-contain"
                        src={assetUrl(previewFile.publicUrl)}
                      />
                    </button>
                  ) : (
                    <div className="flex h-[420px] items-center justify-center rounded-xl bg-white text-sm text-stone-400">
                      暂无原稿文件
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-stone-200 bg-white px-8 py-8">
                  <div className="mx-auto max-w-3xl">
                    <h3 className="text-center text-2xl font-bold tracking-wide text-ink">
                      {previewTextTitle}
                    </h3>
                    <div className="mt-8 space-y-0 text-[17px] leading-[2.2] text-stone-700">
                      {previewTextBody.length ? (
                        previewTextBody.map((paragraph, index) => (
                          <p key={`${index}-${paragraph.slice(0, 12)}`} className="indent-[2em]">
                            {paragraph}
                          </p>
                        ))
                      ) : (
                        <p className="indent-[2em]">
                          {remoteText || '系统会先自动 OCR；如果识别结果不完整或失败，再在这里补录或修正文稿。'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
              {sourceTab === 'image' ? (
                <p className="text-sm text-stone-500">
                  点击图片可放大并进入对照校对模式。
                </p>
              ) : (
                <Button
                  disabled={!previewFile}
                  variant="secondary"
                  onClick={() => setIsPreviewOpen(true)}
                >
                  <ImageIcon className="mr-2 size-4" />
                  打开校对窗口
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-xl p-4">
            <ReviewScorePanel embedded score={score} />
            <div className="mt-5 border-t border-stone-100 pt-5">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink">
                <span className="h-4 w-1 rounded-full bg-accent" />
                AI 总评
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                {submissionQuery.data?.review?.aiSummary ?? '尚未生成'}
              </p>
            </div>
          </Card>
          <ReviewDimensionCards
            comments={dimensionComments}
            score={score}
            action={
              <Button
                className="h-9 px-3"
                variant="secondary"
                onClick={openScoreModal}
              >
                <SlidersHorizontal className="mr-1.5 size-4" />
                调整分数
              </Button>
            }
          />
          <Card className="rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-500">字数统计</p>
                <p className="mt-1 text-2xl font-black text-ink">{wordCount || '--'}字</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-stone-500">建议字数</p>
                <p className="mt-1 text-base font-bold text-ink">600-800字</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  wordCount >= 600 && wordCount <= 800
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {wordCount >= 600 && wordCount <= 800 ? '符合要求' : '建议调整'}
              </span>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-ink">AI 智能评语</h3>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={openAiReviewModal}>
                  <Pencil className="mr-2 size-4" />
                  编辑
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => window.open(`/print/submissions/${id}`, '_blank')}
                >
                  <Printer className="mr-2 size-4" />
                  打印
                </Button>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <section className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="flex items-center gap-2 text-base font-bold text-emerald-700">
                  <Sparkles className="size-4" />
                  亮点概述
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {submissionQuery.data?.review?.aiStrengths ?? '尚未生成'}
                </p>
              </section>
              <section className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                <p className="flex items-center gap-2 text-base font-bold text-amber-700">
                  <MessageCircleWarning className="size-4" />
                  存在问题
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {submissionQuery.data?.review?.aiIssues ?? '尚未生成'}
                </p>
              </section>
              <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="flex items-center gap-2 text-base font-bold text-accent">
                  <Lightbulb className="size-4" />
                  修改建议
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {submissionQuery.data?.review?.aiSuggestions ?? '尚未生成'}
                </p>
              </section>
            </div>
          </Card>

          <Card className="rounded-xl p-4">
            <h3 className="text-lg font-bold text-ink">教师评语</h3>
            <Textarea
              className="mt-4 min-h-[100px] rounded-xl border-stone-200"
              placeholder="请输入教师评语（最多 500 字）"
              value={finalComment}
              onChange={(event) => setFinalComment(event.target.value)}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {quickComments.map((label) => (
                <button
                  key={label}
                  className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-blue-100"
                  type="button"
                  onClick={() =>
                    setFinalComment((current) =>
                      current ? `${current}\n${label}：` : `${label}：`,
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                disabled={finalMutation.isPending || !finalComment.trim()}
                onClick={() => finalMutation.mutate()}
              >
                {finalMutation.isPending ? '保存中...' : '保存评语'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {isScoreModalOpen
        ? createPortal(
        <div
          aria-modal="true"
          className="flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100dvh',
            zIndex: 2147483647,
          }}
          onClick={() => setIsScoreModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-ink">调整分数</h3>
                <p className="mt-2 text-sm text-stone-500">
                  只能调整四个维度分数，总分会由系统自动相加。
                </p>
              </div>
              <button
                className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                type="button"
                onClick={() => setIsScoreModalOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-stone-500">当前总分</p>
              <p className="mt-1 text-4xl font-black leading-none text-accent">
                {scoreDraftTotal}
              </p>
            </div>

            <div className="mt-6 space-y-5">
              {dimensionMeta.map((item) => {
                const value = scoreDraft[item.key]
                const Icon = item.icon
                return (
                  <div key={item.key} className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-ink">{item.label}</p>
                          <p className="mt-1 text-sm text-stone-500">
                            {getDimensionComment(item.key, value)}
                          </p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-accent">
                        {value}
                        <span className="ml-1 text-sm font-semibold text-stone-400">
                          / {item.max}
                        </span>
                      </p>
                    </div>
                    <input
                      className="mt-4 w-full accent-blue-600"
                      max={item.max}
                      min={0}
                      step={1}
                      type="range"
                      value={value}
                      onChange={(event) =>
                        setScoreDraft((current) => ({
                          ...current,
                          [item.key]: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setIsScoreModalOpen(false)}>
                取消
              </Button>
              <Button
                disabled={scoreMutation.isPending}
                onClick={() => scoreMutation.mutate()}
              >
                {scoreMutation.isPending ? '保存中...' : '保存分数'}
              </Button>
            </div>
          </div>
        </div>,
          document.body,
        )
        : null}

      {isAiReviewModalOpen
        ? createPortal(
        <div
          aria-modal="true"
          className="flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100dvh',
            zIndex: 2147483647,
          }}
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-ink">编辑结构化评语</h3>
              </div>
              <button
                className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                type="button"
                onClick={() => setIsAiReviewModalOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-4 w-1 rounded-full bg-accent" />
                  AI 总评
                </span>
                <Textarea
                  className="mt-2 min-h-[96px] rounded-xl border-stone-200"
                  value={aiReviewDraft.aiSummary}
                  onChange={(event) =>
                    setAiReviewDraft((current) => ({
                      ...current,
                      aiSummary: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-4 w-1 rounded-full bg-accent" />
                  亮点概述
                </span>
                <Textarea
                  className="mt-2 min-h-[96px] rounded-xl border-stone-200"
                  value={aiReviewDraft.aiStrengths}
                  onChange={(event) =>
                    setAiReviewDraft((current) => ({
                      ...current,
                      aiStrengths: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-4 w-1 rounded-full bg-accent" />
                  存在问题
                </span>
                <Textarea
                  className="mt-2 min-h-[96px] rounded-xl border-stone-200"
                  value={aiReviewDraft.aiIssues}
                  onChange={(event) =>
                    setAiReviewDraft((current) => ({
                      ...current,
                      aiIssues: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-4 w-1 rounded-full bg-accent" />
                  修改建议
                </span>
                <Textarea
                  className="mt-2 min-h-[120px] rounded-xl border-stone-200"
                  value={aiReviewDraft.aiSuggestions}
                  onChange={(event) =>
                    setAiReviewDraft((current) => ({
                      ...current,
                      aiSuggestions: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-4 w-1 rounded-full bg-accent" />
                  参考修改
                </span>
                <Textarea
                  className="mt-2 min-h-[120px] rounded-xl border-stone-200"
                  value={aiReviewDraft.aiRewriteExample}
                  onChange={(event) =>
                    setAiReviewDraft((current) => ({
                      ...current,
                      aiRewriteExample: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setIsAiReviewModalOpen(false)}
              >
                取消
              </Button>
              <Button
                disabled={aiReviewMutation.isPending}
                onClick={() => aiReviewMutation.mutate()}
              >
                {aiReviewMutation.isPending ? '保存中...' : '保存评语'}
              </Button>
            </div>
          </div>
        </div>,
          document.body,
        )
        : null}

      {isPreviewOpen && previewFile
        ? createPortal(
        <div
          aria-modal="true"
          className="overflow-hidden bg-black/75 p-3 sm:p-4"
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100dvh',
            zIndex: 2147483647,
          }}
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="mx-auto h-full max-w-[1600px] overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid h-full min-h-0 gap-4 bg-stone-100 p-3 lg:grid-cols-[minmax(0,4fr)_minmax(260px,1fr)] xl:grid-cols-[minmax(0,4fr)_minmax(300px,1fr)]">
              <div className="min-h-[42vh] overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 lg:min-h-0">
                {previewFile.fileType === 'PDF' ? (
                  <iframe
                    className="h-full min-h-[66vh] w-full rounded-xl bg-white lg:min-h-full"
                    src={assetUrl(previewFile.publicUrl)}
                    title="作文原稿校对"
                  />
                ) : (
                  <div className="flex min-h-full items-start justify-center rounded-xl bg-white p-2">
                    <img
                      alt="作文原稿校对"
                      className="max-w-full rounded-lg object-contain"
                      src={assetUrl(previewFile.publicUrl)}
                    />
                  </div>
                )}
              </div>

              <aside className="flex min-h-[320px] flex-col rounded-xl border border-stone-200 bg-white p-4 lg:min-h-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-ink">识别正文</h4>
                    <p className="mt-1 text-sm text-stone-500">
                      当前 {text.replace(/\s/g, '').length || 0} 字
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      text.trim().length >= 20
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {text.trim().length >= 20 ? '可保存' : '需补全文字'}
                  </span>
                </div>

                <Textarea
                  className="mt-4 min-h-[260px] flex-1 resize-none rounded-xl border-stone-200 text-sm leading-7 lg:min-h-0"
                  placeholder="对照左侧原稿，在这里修正 OCR 识别正文。"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />

                <div className="mt-4 grid gap-2">
                  <Button
                    disabled={saveTextMutation.isPending || text.trim().length < 20}
                    onClick={() => saveTextMutation.mutate()}
                  >
                    <Save className="mr-2 size-4" />
                    {saveTextMutation.isPending ? '保存中...' : '保存正文'}
                  </Button>
                  <Button
                    disabled={
                      reviewMutation.isPending ||
                      submissionQuery.data?.status === 'TEXT_EXTRACTING' ||
                      text.trim().length < 20
                    }
                    variant="secondary"
                    onClick={() => reviewMutation.mutate()}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    {reviewMutation.isPending ? '提交中...' : '重新生成评语'}
                  </Button>
                </div>
              </aside>
            </div>
          </div>
        </div>,
          document.body,
        )
        : null}
    </div>
  )
}
