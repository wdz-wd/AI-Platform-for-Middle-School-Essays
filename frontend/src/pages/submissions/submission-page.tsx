import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Lightbulb,
  MessageCircleWarning,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

export function SubmissionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [studentId, setStudentId] = useState('')
  const [finalComment, setFinalComment] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [sourceTab, setSourceTab] = useState<'image' | 'text'>('image')
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
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
    queryKey: ['students', submissionQuery.data?.task.class.id, 'bind'],
    queryFn: () =>
      apiFetch<StudentItem[]>(
        `/students?classId=${submissionQuery.data?.task.class.id ?? ''}`,
      ),
    enabled: !!submissionQuery.data?.task.class.id,
  })

  const remoteText =
    submissionQuery.data?.text?.correctedText?.trim() ||
    submissionQuery.data?.text?.ocrText?.trim() ||
    ''

  const previewFiles = submissionQuery.data?.files ?? []
  const previewFile = previewFiles[currentPageIndex] ?? previewFiles[0]
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
    setStudentId(submissionQuery.data.student?.id ?? '')
    setFinalComment(
      submissionQuery.data.review?.finalComment ??
        submissionQuery.data.review?.teacherComment ??
        '',
    )
  }, [remoteText, submissionQuery.data, text])

  useEffect(() => {
    setCurrentPageIndex(0)
  }, [id])

  useEffect(() => {
    if (currentPageIndex > previewFiles.length - 1) {
      setCurrentPageIndex(0)
    }
  }, [currentPageIndex, previewFiles.length])

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
        body: JSON.stringify({ studentId: studentId || null }),
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
                className={`rounded-2xl border px-4 py-2.5 text-sm ${feedbackClass(feedback.tone)}`}
              >
                {feedback.message}
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-500">
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-accent">
              {submissionQuery.data?.task.class.name ?? '未分班'}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-accent">
              {submissionQuery.data?.student?.name ??
                submissionQuery.data?.detectedName ??
                '未绑定学生'}
            </span>
            {submissionQuery.data?.student?.studentNo ? (
              <span>学号：{submissionQuery.data.student.studentNo}</span>
            ) : null}
            <span>提交时间：{submissionQuery.data ? formatDate(submissionQuery.data.createdAt ?? '') : '--'}</span>
            <span>字数：{wordCount || '--'} 字</span>
            <select
              className="h-10 min-w-[220px] rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">暂不绑定学生</option>
              {studentsQuery.data?.map((item) => (
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
        <Card className="overflow-hidden rounded-2xl p-0">
          <div className="border-b border-stone-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">作文原文</h2>
                <p className="mt-1 text-sm text-stone-500">支持切换原稿图片与提取文字</p>
              </div>
              <div className="flex rounded-xl bg-stone-100 p-1">
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
              </div>
            </div>
          </div>

          <div className="p-5">
            {sourceTab === 'image' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
                  <div className="font-semibold text-ink">
                    {previewFiles.length ? `${currentPageIndex + 1} / ${previewFiles.length}` : '0 / 0'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={currentPageIndex === 0}
                      onClick={() =>
                        setCurrentPageIndex((current) => Math.max(0, current - 1))
                      }
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={currentPageIndex >= previewFiles.length - 1}
                      onClick={() =>
                        setCurrentPageIndex((current) =>
                          Math.min(previewFiles.length - 1, current + 1),
                        )
                      }
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  {previewFile?.fileType === 'PDF' ? (
                    <iframe
                      className="h-[700px] w-full rounded-xl bg-white"
                      src={assetUrl(previewFile.publicUrl)}
                      title="作文预览"
                    />
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

                {previewFiles.length > 1 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {previewFiles.map((file, index) => (
                      <button
                        key={file.id}
                        className={`min-w-[84px] rounded-2xl border p-2 text-center transition ${
                          index === currentPageIndex
                            ? 'border-accent bg-blue-50'
                            : 'border-stone-200 bg-white'
                        }`}
                        type="button"
                        onClick={() => setCurrentPageIndex(index)}
                      >
                        <div className="flex h-[92px] items-center justify-center rounded-xl bg-stone-50 text-xs text-stone-400">
                          {file.fileType === 'PDF' ? 'PDF' : '第 ' + (index + 1) + ' 页'}
                        </div>
                        <p className="mt-2 text-sm font-medium text-stone-500">{index + 1}</p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-stone-200 bg-white px-8 py-8">
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
                <Textarea
                  className="min-h-[240px] rounded-2xl border-stone-200"
                  placeholder="如果识别结果不完整或失败，可在这里补录或修正文稿。"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
              <Button
                variant="secondary"
                disabled={saveTextMutation.isPending || text.trim().length < 20}
                onClick={() => saveTextMutation.mutate()}
              >
                <Save className="mr-2 size-4" />
                保存正文
              </Button>
              <Button
                variant="secondary"
                disabled={
                  reviewMutation.isPending ||
                  submissionQuery.data?.status === 'TEXT_EXTRACTING' ||
                  text.trim().length < 20
                }
                onClick={() => reviewMutation.mutate()}
              >
                <RefreshCw className="mr-2 size-4" />
                重新生成评语
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl p-4">
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
          <ReviewDimensionCards comments={dimensionComments} score={score} />
          <Card className="rounded-2xl p-4">
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
          <Card className="rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-ink">AI 智能评语</h3>
              <Button
                variant="secondary"
                onClick={() => window.open(`/print/submissions/${id}`, '_blank')}
              >
                <Printer className="mr-2 size-4" />
                打印
              </Button>
            </div>
            <div className="mt-5 space-y-4">
              <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="flex items-center gap-2 text-base font-bold text-emerald-700">
                  <Sparkles className="size-4" />
                  亮点概述
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {submissionQuery.data?.review?.aiStrengths ?? '尚未生成'}
                </p>
              </section>
              <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                <p className="flex items-center gap-2 text-base font-bold text-amber-700">
                  <MessageCircleWarning className="size-4" />
                  存在问题
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {submissionQuery.data?.review?.aiIssues ?? '尚未生成'}
                </p>
              </section>
              <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
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

          <Card className="rounded-2xl p-4">
            <h3 className="text-lg font-bold text-ink">教师评语</h3>
            <Textarea
              className="mt-4 min-h-[100px] rounded-2xl border-stone-200"
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

      {isPreviewOpen && previewFile && previewFile.fileType !== 'PDF' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsPreviewOpen(false)}
        >
          <img
            alt="作文原稿放大预览"
            className="max-h-[92vh] max-w-[96vw] rounded-2xl bg-white object-contain shadow-2xl"
            src={assetUrl(previewFile.publicUrl)}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}
