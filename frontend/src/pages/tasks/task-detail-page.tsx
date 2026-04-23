import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, uploadFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { FilePicker } from '../../components/ui/file-picker'
import { formatDate } from '../../lib/utils'
import type { TaskDetail } from '../../types/api'

function submissionTone(status: TaskDetail['submissions'][number]['status']) {
  if (status === 'AI_DONE' || status === 'REVIEWED') return 'success'
  if (status === 'FAILED') return 'danger'
  if (
    status === 'TEXT_PENDING_CORRECTION' ||
    status === 'AI_PROCESSING' ||
    status === 'TEXT_EXTRACTING'
  ) {
    return 'warning'
  }
  return 'neutral'
}

export function TaskDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [topicFile, setTopicFile] = useState<File | null>(null)
  const [submissionFiles, setSubmissionFiles] = useState<FileList | null>(null)

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

  const topicMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      if (topicFile) {
        formData.append('file', topicFile)
      }
      return uploadFetch(`/tasks/${id}/topic-files`, formData)
    },
    onSuccess: async () => {
      setTopicFile(null)
      await queryClient.invalidateQueries({ queryKey: ['task', id] })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-ink">题面附件（可选）</h2>
            <p className="text-sm leading-7 text-stone-500">
              如果新建任务时已经填写完整题面，这里可以不传。上传附件主要用于留存原题文件，必要时辅助重新生成题目讲解。
            </p>
            <FilePicker
              accept=".jpg,.jpeg,.png,.pdf"
              hint="可上传题面截图或 PDF，非必填"
              label="上传题面附件"
              value={topicFile}
              onChange={(files) => setTopicFile(files?.[0] ?? null)}
            />
            <Button
              disabled={topicMutation.isPending || !topicFile}
              onClick={() => topicMutation.mutate()}
            >
              {topicMutation.isPending ? '处理中...' : '上传题面附件'}
            </Button>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-ink">题目讲解思路</h2>
            {taskQuery.data?.topicGuidance ? (
              <div className="space-y-4 text-sm leading-7 text-stone-600">
                <div>
                  <p className="font-semibold text-ink">题意概括</p>
                  <p>{taskQuery.data.topicGuidance.summary}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">立意方向</p>
                  <p>{taskQuery.data.topicGuidance.ideas}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">行文结构</p>
                  <p>{taskQuery.data.topicGuidance.structure}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">课堂提示</p>
                  <p>{taskQuery.data.topicGuidance.classroomTips}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-500">
                还没有生成题目讲解。优先使用新建任务时填写的题面文本；如需留存原题文件，可在左侧补传附件。
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-ink">批量上传学生作文</h2>
            <FilePicker
              accept=".jpg,.jpeg,.png,.pdf"
              hint="可一次选择多篇作文图片或 PDF"
              label="选择学生作文文件"
              multiple
              value={submissionFiles}
              onChange={setSubmissionFiles}
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-stone-500">
                当前策略：文本型 PDF 优先直提文本；图片和扫描版 PDF 会先自动走百度 OCR，识别失败时再由教师补录正文。
              </p>
              <Button
                disabled={submissionsMutation.isPending || !submissionFiles?.length}
                onClick={() => submissionsMutation.mutate()}
              >
                {submissionsMutation.isPending ? '上传中...' : '上传作文'}
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-stone-100 px-5 py-4">
              <h2 className="text-lg font-bold text-ink">作文列表</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">文件名</th>
                    <th className="px-5 py-4 font-medium">状态</th>
                    <th className="px-5 py-4 font-medium">文稿情况</th>
                    <th className="px-5 py-4 font-medium">AI 总评</th>
                    <th className="px-5 py-4 font-medium">更新时间</th>
                    <th className="px-5 py-4 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {taskQuery.data?.submissions.map((submission) => (
                    <tr key={submission.id} className="border-t border-stone-100">
                      <td className="px-5 py-4 text-ink">
                        {submission.files[0]?.fileName ?? submission.detectedName ?? '未命名文件'}
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={submissionTone(submission.status)}>
                          {submission.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-stone-600">
                        {submission.status === 'TEXT_EXTRACTING'
                          ? 'OCR 识别中'
                          : submission.text?.correctedText
                          ? '已修正文稿'
                          : submission.text?.ocrText
                            ? '已提取文本'
                            : '待补录'}
                      </td>
                      <td className="max-w-xs px-5 py-4 text-stone-600">
                        {submission.review?.aiSummary ?? '尚未生成'}
                      </td>
                      <td className="px-5 py-4 text-stone-600">
                        {formatDate(submission.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-3">
                          <Link
                            className="font-semibold text-accent"
                            to={`/submissions/${submission.id}`}
                          >
                            逐篇审核
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
          </Card>
        </div>
      </div>
    </div>
  )
}
