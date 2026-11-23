import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Lightbulb,
  ListTree,
  Pencil,
  Presentation,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, uploadFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { FilePicker } from '../../components/ui/file-picker'
import { Input } from '../../components/ui/input'
import { PageTitle } from '../../components/ui/page-title'
import { getSubmissionStatusMeta } from '../../lib/status'
import { cn, formatDate } from '../../lib/utils'
import { useTaskPageStore } from '../../stores/task-page-store'
import type { TaskDetail } from '../../types/api'

const PAGE_SIZE = 10

function PageJump({ totalPages, onJump }: { totalPages: number; onJump: (page: number) => void }) {
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const errorId = useId()

  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm text-stone-600"
      onSubmit={(event) => {
        event.preventDefault()
        const input = draft.trim()
        const target = Number(input)
        if (!/^\d+$/.test(input) || target < 1 || target > totalPages) {
          setInvalid(true)
          return
        }
        onJump(target)
        setDraft('')
        setInvalid(false)
      }}
    >
      <label className="flex items-center gap-1.5">
        跳至第
        <Input
          aria-label="跳转页码"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="h-9 w-16 px-2 text-center"
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setInvalid(false)
          }}
        />
        页
      </label>
      <Button type="submit" variant="secondary" className="h-9 px-3">前往</Button>
      {invalid ? <span id={errorId} role="alert" className="text-xs text-rose-600">请输入 1 到 {totalPages} 的整数页码</span> : null}
    </form>
  )
}

export function TaskDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const storedPage = useTaskPageStore((state) => state.getTaskPage(id))
  const setTaskPage = useTaskPageStore((state) => state.setTaskPage)
  const [submissionFiles, setSubmissionFiles] = useState<FileList | null>(null)
  const [expandedGuidanceTask, setExpandedGuidanceTask] = useState<string | null>(null)
  const [guidanceLimit, setGuidanceLimit] = useState<number | null>(null)
  const topicBriefRef = useRef<HTMLDivElement>(null)
  const rightColumnRef = useRef<HTMLDivElement>(null)
  const guidanceViewportRef = useRef<HTMLDivElement>(null)
  const guidanceBodyRef = useRef<HTMLDivElement>(null)
  const guidanceId = useId()
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const [classModalOpen, setClassModalOpen] = useState(false)
  const [titleModalOpen, setTitleModalOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [deletingSubmission, setDeletingSubmission] = useState<
    TaskDetail['submissions'][number] | null
  >(null)

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

  const taskClasses = taskQuery.data?.classes?.length
    ? taskQuery.data.classes
    : taskQuery.data?.class
      ? [taskQuery.data.class]
      : []
  const classSummary =
    taskClasses.length === 0
      ? '--'
      : taskClasses.length === 1
        ? taskClasses[0].name
        : `${taskClasses[0].name}等`

  const updateTaskMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: titleDraft.trim() }),
      }),
    onSuccess: async () => {
      setTitleModalOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['task', id] })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteSubmissionMutation = useMutation({
    mutationFn: () =>
      deletingSubmission
        ? apiFetch(`/submissions/${deletingSubmission.id}`, { method: 'DELETE' })
        : Promise.resolve(),
    onSuccess: async () => {
      setDeletingSubmission(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['task', id] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['archive'] }),
      ])
    },
  })

  const submissions = taskQuery.data?.submissions ?? []
  const hasWorkingQueue = submissions.some((item) =>
    ['TEXT_EXTRACTING', 'TEXT_READY', 'AI_PROCESSING', 'UPLOADED'].includes(item.status),
  )
  const totalPages = Math.max(1, Math.ceil(submissions.length / PAGE_SIZE))
  const page = Math.min(storedPage, totalPages)
  const pagedSubmissions = submissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    if (taskQuery.data && storedPage > totalPages) {
      setTaskPage(id, totalPages)
    }
  }, [id, setTaskPage, storedPage, taskQuery.data, totalPages])

  const hasGuidance = Boolean(taskQuery.data?.topicGuidance)
  const guidanceExpanded = expandedGuidanceTask === id
  const guidanceCollapsed = guidanceLimit !== null && !guidanceExpanded

  useEffect(() => {
    const rightColumn = rightColumnRef.current
    const brief = topicBriefRef.current
    const viewport = guidanceViewportRef.current
    const body = guidanceBodyRef.current
    const card = viewport?.parentElement
    if (!hasGuidance || !rightColumn || !brief || !viewport || !body || !card) return

    const desktop = window.matchMedia('(min-width: 1280px)')
    const measure = () => {
      // The right column keeps its natural height, even when the guidance expands.
      const { paddingBottom, borderBottomWidth } = getComputedStyle(card)
      const available = Math.floor(
        rightColumn.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top
        - parseFloat(paddingBottom) - parseFloat(borderBottomWidth),
      )
      const needsToggle = desktop.matches && body.getBoundingClientRect().height > available + 1
      setGuidanceLimit(needsToggle ? Math.max(0, available) : null)
    }
    const observer = new ResizeObserver(measure)
    for (const element of [rightColumn, brief, body]) observer.observe(element)
    desktop.addEventListener('change', measure)
    return () => {
      observer.disconnect()
      desktop.removeEventListener('change', measure)
    }
  }, [hasGuidance, id])

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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle>{taskQuery.data?.title ?? '加载中...'}</PageTitle>
        <div className="relative">
          <Button
            variant="secondary"
            onClick={() => setPrintMenuOpen((open) => !open)}
          >
            批量打印
          </Button>
          {printMenuOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
              <button
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-stone-50"
                type="button"
                onClick={() => {
                  setPrintMenuOpen(false)
                  window.open(`/print/tasks/${id}?mode=detail`, '_blank')
                }}
              >
                详细打印
              </button>
              <button
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-stone-50"
                type="button"
                onClick={() => {
                  setPrintMenuOpen(false)
                  window.open(`/print/tasks/${id}`, '_blank')
                }}
              >
                精简打印
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(16rem,1fr)_minmax(0,2.7fr)]">
        <div className="min-w-0 space-y-6">
          <div ref={topicBriefRef}>
            <Card className="rounded-xl p-5 shadow-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-ink">题目基本信息</h2>
                </div>
                {taskQuery.data?.topicFiles?.length ? (
                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-accent">
                    附件 {taskQuery.data.topicFiles.length} 份
                  </div>
                ) : null}
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-500">任务名称</p>
                      <p className="mt-2 text-base font-bold text-ink [overflow-wrap:anywhere]">
                        {taskQuery.data?.title ?? '--'}
                      </p>
                    </div>
                    {taskQuery.data ? (
                      <Button
                        className="h-9 px-3"
                        variant="secondary"
                        onClick={() => {
                          setTitleDraft(taskQuery.data?.title ?? '')
                          setTitleModalOpen(true)
                        }}
                      >
                        <Pencil className="mr-1.5 size-4" />
                        编辑
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                  <button
                    className="block w-full text-left"
                    type="button"
                    onClick={() => setClassModalOpen(true)}
                  >
                    <p className="text-sm font-semibold text-stone-500">所属班级</p>
                    <p className="mt-2 text-base font-bold text-ink">
                      {classSummary}
                    </p>
                  </button>
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
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600 [overflow-wrap:anywhere]">
                    {taskQuery.data?.topicText ?? '暂无题面文本'}
                  </p>
                </div>
                {taskQuery.data?.note ? (
                  <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4">
                    <p className="text-sm font-semibold text-stone-500">任务备注</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600 [overflow-wrap:anywhere]">
                      {taskQuery.data.note}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card className="rounded-xl p-5 shadow-none">
            <div className="flex min-h-8 items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="h-5 w-1 shrink-0 rounded-full bg-accent" />
                <h2 className="text-lg font-bold text-ink">题目讲解思路</h2>
              </div>
              {hasGuidance && guidanceLimit !== null ? (
                <button
                  aria-controls={guidanceId}
                  aria-expanded={guidanceExpanded}
                  className="h-8 shrink-0 rounded-md px-2 text-sm font-semibold text-accent hover:bg-blue-50"
                  type="button"
                  onClick={() => setExpandedGuidanceTask(guidanceExpanded ? null : id)}
                >
                  {guidanceExpanded ? '收起' : '展开全部'}
                </button>
              ) : null}
            </div>
            {hasGuidance ? (
              <div
                ref={guidanceViewportRef}
                id={guidanceId}
                className={cn('relative mt-5', guidanceCollapsed && 'overflow-hidden')}
                style={guidanceCollapsed ? { maxHeight: guidanceLimit } : undefined}
              >
                <div ref={guidanceBodyRef} className="grid gap-4">
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
                          <p className="mt-2 text-sm leading-7 text-stone-600 [overflow-wrap:anywhere]">
                            {item.value}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {guidanceCollapsed ? (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm text-stone-500">
                还没有生成题目讲解。请回到任务创建页补充题面文本，或重新创建任务。
              </p>
            )}
          </Card>
        </div>

        <div ref={rightColumnRef} className="min-w-0 space-y-6">
          <Card className="rounded-xl p-4 shadow-none">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <FilePicker
                accept=".jpg,.jpeg,.png,.pdf"
                hint="支持批量上传作文图片或 PDF"
                hideAction
                label="选择学生作文文件"
                multiple
                value={submissionFiles}
                onChange={setSubmissionFiles}
              />
              <Button
                className="h-12 px-5"
                disabled={submissionsMutation.isPending || !submissionFiles?.length}
                onClick={() => submissionsMutation.mutate()}
              >
                {submissionsMutation.isPending ? '上传中...' : '上传作文'}
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-xl p-0 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-ink">作文列表</h2>
                {hasWorkingQueue ? <Badge tone="info">正在后台批改</Badge> : null}
              </div>
              <span className="text-sm text-stone-500">
                共 {submissions.length} 篇，当前第 {page}/{totalPages} 页
              </span>
            </div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-stone-50 text-left text-stone-500">
                <tr>
                  <th scope="col" className="w-[40%] px-2 py-3 font-medium sm:w-[22%] sm:pl-4">文件名</th>
                  <th scope="col" className="w-[24%] px-1 py-3 font-medium sm:w-[13%] sm:px-2">状态</th>
                  <th scope="col" className="w-[13%] px-1 py-3 font-medium sm:w-[7%] sm:px-2">得分</th>
                  <th scope="col" className="hidden w-[12%] px-2 py-3 font-medium sm:table-cell">文稿情况</th>
                  <th scope="col" className="hidden px-2 py-3 font-medium sm:table-cell">AI 总评</th>
                  <th scope="col" className="hidden w-[12%] px-2 py-3 font-medium sm:table-cell">更新时间</th>
                  <th scope="col" className="w-[23%] px-2 py-3 font-medium sm:w-[16%]">操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedSubmissions.map((submission) => {
                  const fileName = submission.files[0]?.fileName ?? submission.detectedName ?? '未命名文件'
                  const textStatus = submission.status === 'TEXT_EXTRACTING'
                    ? 'OCR 识别中'
                    : submission.text?.correctedText
                      ? '已修正文稿'
                      : submission.text?.ocrText ? '已提取文本' : '待补录'
                  const summary = submission.review?.aiSummary ?? '尚未生成'
                  const updatedAt = formatDate(submission.createdAt)
                  return (
                    <tr key={submission.id} className="border-t border-stone-100">
                      <td className="px-2 py-3 text-ink sm:pl-4">
                        <p className="truncate" title={fileName}>{fileName}</p>
                        <div className="mt-1 space-y-0.5 text-xs text-stone-500 sm:hidden">
                          <p className="[overflow-wrap:anywhere]">{textStatus} · {updatedAt}</p>
                          <p className="line-clamp-2 [overflow-wrap:anywhere]">AI 总评：{summary}</p>
                        </div>
                      </td>
                      <td className="px-1 py-3 [overflow-wrap:anywhere] sm:px-2">
                        <Badge tone={getSubmissionStatusMeta(submission.status).tone}>
                          {getSubmissionStatusMeta(submission.status).label}
                        </Badge>
                      </td>
                      <td className="px-1 py-3 sm:px-2">
                        <span
                          className={cn(
                            'inline-flex min-w-7 items-center justify-center rounded-lg px-1 py-1.5 text-sm font-black',
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
                      <td className="hidden px-2 py-3 text-stone-600 [overflow-wrap:anywhere] sm:table-cell">
                        {textStatus}
                      </td>
                      <td className="hidden px-2 py-3 text-stone-600 sm:table-cell">
                        <p className="line-clamp-4 [overflow-wrap:anywhere]">{summary}</p>
                      </td>
                      <td className="hidden px-2 py-3 text-stone-600 [overflow-wrap:anywhere] sm:table-cell">
                        {updatedAt}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs [&>*]:whitespace-nowrap xl:text-sm">
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
                          <button
                            className="font-semibold text-rose-600"
                            type="button"
                            onClick={() => setDeletingSubmission(submission)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4">
              <p className="text-sm text-stone-500">每页 {PAGE_SIZE} 篇</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    className="h-10 px-3"
                    disabled={page <= 1}
                    variant="secondary"
                    onClick={() => setTaskPage(id, page - 1)}
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
                    onClick={() => setTaskPage(id, page + 1)}
                  >
                    下一页
                  </Button>
                </div>
                {totalPages > 1 ? (
                  <PageJump key={`${id}:${page}`} totalPages={totalPages} onJump={(target) => setTaskPage(id, target)} />
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {classModalOpen
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
              onClick={() => setClassModalOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-black text-ink">所属班级</h3>
                  <button
                    className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setClassModalOpen(false)}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="mt-5 space-y-3">
                  {taskClasses.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm font-semibold text-ink"
                    >
                      {item.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {titleModalOpen
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
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-black text-ink">编辑任务名称</h3>
                  <button
                    className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setTitleModalOpen(false)}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-stone-600">
                    任务名称
                  </label>
                  <Input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                  />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setTitleModalOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={!titleDraft.trim() || updateTaskMutation.isPending}
                    onClick={() => updateTaskMutation.mutate()}
                  >
                    {updateTaskMutation.isPending ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deletingSubmission
        ? createPortal(
            <div
              className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/45 p-4"
              onMouseDown={() => setDeletingSubmission(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-rose-600">删除作文</p>
                    <h2 className="mt-1 text-2xl font-black text-ink">
                      {deletingSubmission.files[0]?.fileName ??
                        deletingSubmission.detectedName ??
                        '未命名文件'}
                    </h2>
                  </div>
                  <button
                    className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setDeletingSubmission(null)}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="mt-5 text-sm leading-6 text-stone-600">
                  是否确定删除该篇作文？
                </p>
                {deleteSubmissionMutation.isError ? (
                  <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {(deleteSubmissionMutation.error as Error).message}
                  </p>
                ) : null}
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setDeletingSubmission(null)}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={deleteSubmissionMutation.isPending}
                    variant="danger"
                    onClick={() => deleteSubmissionMutation.mutate()}
                  >
                    确认删除
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
