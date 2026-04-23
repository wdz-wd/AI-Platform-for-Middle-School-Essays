import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Textarea } from '../../components/ui/textarea'
import { assetUrl } from '../../lib/utils'
import type { StudentItem, SubmissionDetail } from '../../types/api'

export function SubmissionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [studentId, setStudentId] = useState('')
  const [finalComment, setFinalComment] = useState('')
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
        message: 'AI 评语已生成，可以继续调整终稿或打印。',
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

  const previewFile = submissionQuery.data?.files[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
            Submission Workbench
          </p>
          <h1 className="mt-2 text-3xl font-black text-ink">
            {submissionQuery.data?.student?.name ??
              previewFile?.fileName ??
              submissionQuery.data?.detectedName ??
              '未命名作文'}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {submissionQuery.data?.task.class.name} · {submissionQuery.data?.task.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {navigation.prev ? (
            <Button
              variant="secondary"
              onClick={() => navigate(`/submissions/${navigation.prev?.id}`)}
            >
              上一篇
            </Button>
          ) : null}
          {navigation.next ? (
            <Button
              variant="secondary"
              onClick={() => navigate(`/submissions/${navigation.next?.id}`)}
            >
              下一篇
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => window.open(`/print/submissions/${id}`, '_blank')}
          >
            打印
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1fr_1fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">原稿预览</h2>
            <Badge>{submissionQuery.data?.status ?? '加载中'}</Badge>
          </div>
          {previewFile?.fileType === 'PDF' ? (
            <iframe
              className="h-[700px] w-full rounded-2xl border border-stone-200"
              src={assetUrl(previewFile.publicUrl)}
              title="作文预览"
            />
          ) : (
            <img
              alt="作文原稿"
              className="w-full rounded-2xl border border-stone-200 object-contain"
              src={assetUrl(previewFile?.publicUrl ?? '')}
            />
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">正文校核</h2>
            <Button
              variant="secondary"
              disabled={saveTextMutation.isPending || text.trim().length < 20}
              onClick={() => saveTextMutation.mutate()}
            >
              保存正文
            </Button>
          </div>
          {actionFeedback ? (
            <div
              className={
                actionFeedback.tone === 'success'
                  ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
                  : actionFeedback.tone === 'error'
                    ? 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'
                    : 'rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700'
              }
            >
              {actionFeedback.message}
            </div>
          ) : null}
          {statusFeedback ? (
            <div
              className={
                statusFeedback.tone === 'success'
                  ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
                  : statusFeedback.tone === 'error'
                    ? 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'
                    : 'rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700'
              }
            >
              {statusFeedback.message}
            </div>
          ) : null}
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-600">
              绑定学生
            </label>
            <div className="flex gap-3">
              <select
                className="h-11 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                <option value="">暂不绑定</option>
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
                绑定
              </Button>
            </div>
          </div>
          <Textarea
            className="min-h-[520px]"
            placeholder="系统会先自动 OCR；如果识别结果不完整或失败，再在这里补录或修正文稿。"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            disabled={
              reviewMutation.isPending ||
              submissionQuery.data?.status === 'TEXT_EXTRACTING' ||
              text.trim().length < 20
            }
            onClick={() => reviewMutation.mutate()}
          >
            {reviewMutation.isPending ? '生成中...' : '重新生成评语'}
          </Button>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-ink">AI 点评与教师终稿</h2>
          <div className="space-y-4 text-sm leading-7 text-stone-600">
            <section>
              <p className="font-semibold text-ink">总体评价</p>
              <p>{submissionQuery.data?.review?.aiSummary ?? '尚未生成'}</p>
            </section>
            <section>
              <p className="font-semibold text-ink">亮点概述</p>
              <p>{submissionQuery.data?.review?.aiStrengths ?? '尚未生成'}</p>
            </section>
            <section>
              <p className="font-semibold text-ink">主要问题</p>
              <p>{submissionQuery.data?.review?.aiIssues ?? '尚未生成'}</p>
            </section>
            <section>
              <p className="font-semibold text-ink">修改建议</p>
              <p>{submissionQuery.data?.review?.aiSuggestions ?? '尚未生成'}</p>
            </section>
            <section>
              <p className="font-semibold text-ink">参考修改</p>
              <p>{submissionQuery.data?.review?.aiRewriteExample ?? '尚未生成'}</p>
            </section>
          </div>
          <div className="border-t border-stone-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-ink">教师终稿</p>
            <Textarea
              className="min-h-[220px]"
              placeholder="可在这里整理最终评语，打印将以这里的内容为主。"
              value={finalComment}
              onChange={(event) => setFinalComment(event.target.value)}
            />
            <div className="mt-4 flex justify-end">
              <Button
                disabled={finalMutation.isPending || !finalComment.trim()}
                onClick={() => finalMutation.mutate()}
              >
                {finalMutation.isPending ? '保存中...' : '保存终稿'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
