import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Lightbulb,
  ListTree,
  Presentation,
  Upload,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, uploadFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { FilePicker } from '../../components/ui/file-picker'
import { getSubmissionStatusMeta } from '../../lib/status'
import { cn, formatDate } from '../../lib/utils'
import type { TaskDetail } from '../../types/api'

export function TaskDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [submissionFiles, setSubmissionFiles] = useState<FileList | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 9

  const taskQuery = useQuery({
    queryKey: ['task', id],
    queryFn: () => apiFetch<TaskDetail>(`/tasks/${id}`),
    refetchInterval: (query) => {
      const task = query.state.data
      if (!task) return false
      return task.submissions.some((item) =>
        ['TEXT_EXTRACTING', 'TEXT_READY', 'AI_PROCESSING', 'UPLOADED'].includes(
          item.status,
        ),
      )
        ? 5000
        : false
    },
  })

  const submissionsMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      Array.from(submissionFiles ?? []).forEach((file) => {
        formData.append('files', file)
      })
      return uploadFetch(`/tasks/${id}/submissions/upload`, formData)
    },
    onSuccess: async () => {
      setSubmissionFiles(null)
      await queryClient.invalidateQueries({ queryKey: ['task', id] })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const hasWorkingQueue = useMemo(
    () =>
      taskQuery.data?.submissions.some((item) =>
        ['TEXT_EXTRACTING', 'TEXT_READY', 'AI_PROCESSING', 'UPLOADED'].includes(
          item.status,
        ),
      ) ?? false,
    [taskQuery.data],
  )

  const submissions = taskQuery.data?.submissions ?? []
  const totalPages = Math.max(1, Math.ceil(submissions.length / pageSize))
  const pagedSubmissions = submissions.slice((page - 1) * pageSize, page * pageSize)

  const guidanceCards = taskQuery.data?.topicGuidance
    ? [
        {
          label: '题意概括',
          value: taskQuery.data.topicGuidance.summary,
          icon: ClipboardList,
          tone: 'blue',
        },
        {
          label: '立意方向',
          value: taskQuery.data.topicGuidance.ideas,
          icon: Lightbulb,
          tone: 'amber',
        },
        {
          label: '行文结构',
          value: taskQuery.data.topicGuidance.structure,
          icon: ListTree,
          tone: 'violet',
        },
        {
          label: '课堂提示',
          value: taskQuery.data.topicGuidance.classroomTips,
          icon: Presentation,
          tone: 'cyan',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
            Task Detail
          </p>
          <h1 className="mt-2 text-3xl font-black text-ink">
            {taskQuery.data?.title ?? '加载中...'}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {taskQuery.data?.class.name} · 共 {taskQuery.data?.totalCount ?? 0} 篇作文
            {hasWorkingQueue ? ' · 正在后台批改' : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => window.open(`/print/tasks/${id}`, '_blank')}
        >
          批量打印
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.28fr]">
        <div className="space-y-6">
          <Card className="rounded-xl p-5 shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-stone-400">
                  Topic Brief
                </p>
                <h2 className="mt-2 text-xl font-black text-ink">题目基本信息</h2>
              </div>
              {taskQuery.data?.topicFiles?.length ? (
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-accent">
                  附件 {taskQuery.data.topicFiles.length} 份
                </div>
              ) : null}
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-500">任务名称</p>
                <p className="mt-2 text-base font-bold text-ink">
                  {taskQuery.data?.title ?? '--'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                  <p className="text-sm font-semibold text-stone-500">所属班级</p>
                  <p className="mt-2 text-base font-bold text-ink">
                    {taskQuery.data?.class.name ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                  <p className="text-sm font-semibold text-stone-500">创建时间</p>
                  <p className="mt-2 text-base font-bold text-ink">
                    {taskQuery.data ? formatDate(taskQuery.data.createdAt) : '--'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                <p className="text-sm font-semibold text-stone-500">作文题目与材料</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {taskQuery.data?.topicText ?? '暂无题面文本'}
                </p>
              </div>
              {taskQuery.data?.note ? (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                  <p className="text-sm font-semibold text-stone-500">任务备注</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                    {taskQuery.data.note}
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="rounded-xl p-5 shadow-none">
            <div className="flex items-center gap-3">
              <span className="h-5 w-1 rounded-full bg-accent" />
              <h2 className="text-lg font-bold text-ink">题目讲解思路</h2>
            </div>
            {taskQuery.data?.topicGuidance ? (
              <div className="mt-5 grid gap-4">
                {guidanceCards.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border px-4 py-4',
                        item.tone === 'blue' && 'border-blue-100 bg-blue-50/70',
                        item.tone === 'amber' && 'border-amber-100 bg-amber-50/80',
                        item.tone === 'violet' && 'border-violet-100 bg-violet-50/70',
                        item.tone === 'cyan' && 'border-cyan-100 bg-cyan-50/70',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          item.tone === 'blue' && 'bg-white text-blue-600',
                          item.tone === 'amber' && 'bg-white text-amber-600',
                          item.tone === 'violet' && 'bg-white text-violet-600',
                          item.tone === 'cyan' && 'bg-white text-cyan-600',
                        )}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">{item.label}</p>
                        <p className="mt-2 text-sm leading-7 text-stone-600">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-5 text-sm text-stone-500">
                还没有生成题目讲解。请回到任务创建页补充题面文本，或重新创建任务。
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-xl p-5 shadow-none">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-accent">
                <Upload className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">批量上传学生作文</h2>
                <p className="mt-2 text-sm text-stone-500">
                  可一次选择多篇作文图片或 PDF，系统会自动进入识别与批改流程。
                </p>
              </div>
            </div>
            <div className="mt-4">
              <FilePicker
                accept=".jpg,.jpeg,.png,.pdf"
                hint="支持批量上传作文图片或 PDF"
                label="选择学生作文文件"
                multiple
                value={submissionFiles}
                onChange={setSubmissionFiles}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                disabled={submissionsMutation.isPending || !submissionFiles?.length}
                onClick={() => submissionsMutation.mutate()}
              >
                {submissionsMutation.isPending ? '上传中...' : '上传作文'}
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-xl p-0 shadow-none">
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
              <h2 className="text-lg font-bold text-ink">作文列表</h2>
              <span className="text-sm text-stone-500">
                共 {submissions.length} 篇，当前第 {page}/{totalPages} 页
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] text-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                  <tr>
                    <th className="w-[220px] px-5 py-4 font-medium">文件名</th>
                    <th className="w-[140px] px-5 py-4 font-medium">状态</th>
                    <th className="px-5 py-4 font-medium">AI评分</th>
                    <th className="w-[120px] px-5 py-4 font-medium">文稿情况</th>
                    <th className="px-5 py-4 font-medium">AI 总评</th>
                    <th className="px-5 py-4 font-medium">更新时间</th>
                    <th className="w-[130px] px-5 py-4 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSubmissions.map((submission) => (
                    <tr key={submission.id} className="border-t border-stone-100">
                      <td className="max-w-[220px] px-5 py-4 text-ink">
                        <p className="truncate">
                          {submission.files[0]?.fileName ?? submission.detectedName ?? '未命名文件'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={getSubmissionStatusMeta(submission.status).tone}>
                          {getSubmissionStatusMeta(submission.status).label}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'inline-flex min-w-[74px] items-center justify-center rounded-xl px-3 py-2 text-sm font-black',
                            submission.review?.scoreTotal == null &&
                              'bg-stone-100 text-stone-400',
                            submission.review?.scoreTotal != null &&
                              submission.review.scoreTotal >= 40 &&
                              'bg-emerald-50 text-emerald-700',
                            submission.review?.scoreTotal != null &&
                              submission.review.scoreTotal >= 36 &&
                              submission.review.scoreTotal < 40 &&
                              'bg-orange-50 text-orange-700',
                            submission.review?.scoreTotal != null &&
                              submission.review.scoreTotal < 36 &&
                              'bg-amber-50 text-amber-700',
                          )}
                        >
                          {submission.review?.scoreTotal == null
                            ? '--'
                            : `${submission.review.scoreTotal}`}
                        </span>
                      </td>
                      <td className="max-w-[120px] px-5 py-4 text-stone-600">
                        <p className="truncate">
                          {submission.status === 'TEXT_EXTRACTING'
                            ? 'OCR 识别中'
                            : submission.text?.correctedText
                              ? '已修正文稿'
                              : submission.text?.ocrText
                                ? '已提取文本'
                                : '待补录'}
                        </p>
                      </td>
                      <td className="max-w-xs px-5 py-4 text-stone-600">
                        <p className="line-clamp-4">
                          {submission.review?.aiSummary ?? '尚未生成'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-stone-600">
                        {formatDate(submission.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap">
                          <Link
                            className="font-semibold text-accent"
                            to={`/submissions/${submission.id}`}
                          >
                            审核
                          </Link>
                          <Link
                            className="font-semibold text-stone-500"
                            target="_blank"
                            to={`/print/submissions/${submission.id}`}
                          >
                            打印
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-stone-100 px-5 py-4">
              <p className="text-sm text-stone-500">每页 {pageSize} 篇</p>
              <div className="flex items-center gap-2">
                <Button
                  className="h-10 px-3"
                  disabled={page <= 1}
                  variant="secondary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <span className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600">
                  {page} / {totalPages}
                </span>
                <Button
                  className="h-10 px-3"
                  disabled={page >= totalPages}
                  variant="secondary"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  下一页
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
