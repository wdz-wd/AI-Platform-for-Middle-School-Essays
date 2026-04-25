import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  PieChart as PieChartIcon,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { ChartContainer } from '../../components/ui/chart'
import { Input } from '../../components/ui/input'
import { getSubmissionStatusMeta } from '../../lib/status'
import { cn, formatDate } from '../../lib/utils'
import type { ArchiveItem, ClassItem, StudentItem } from '../../types/api'

type ScoreBucket = '' | 'high' | 'mid' | 'low' | 'pending'
type StatusFilter = '' | 'REVIEWED' | 'AI_DONE' | 'PENDING'

const pageSize = 9

const chartConfig = {
  trend: {
    label: '平均分',
    color: '#2563eb',
  },
  reviewed: {
    label: '已确认',
    color: '#16a34a',
  },
  aiDone: {
    label: 'AI已完成',
    color: '#2563eb',
  },
  processing: {
    label: '处理中',
    color: '#f59e0b',
  },
  low: {
    label: '低分',
    color: '#f97316',
  },
  pending: {
    label: '待评分',
    color: '#94a3b8',
  },
} as const

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function scoreBucketOf(score?: number | null): Exclude<ScoreBucket, ''> {
  if (score == null) return 'pending'
  if (score >= 40) return 'high'
  if (score >= 36) return 'mid'
  return 'low'
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthLabel(date: Date) {
  return `${date.getMonth() + 1}月`
}

function getRecentMonthSeries(items: Array<{ createdAt: string; score?: number | null }>) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: monthLabel(date),
      values: [] as number[],
    }
  })

  const monthMap = new Map(months.map((item) => [item.key, item]))

  items.forEach((item) => {
    if (item.score == null) return
    const createdAt = new Date(item.createdAt)
    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`
    monthMap.get(key)?.values.push(item.score)
  })

  return months.map((item) => ({
    month: item.label,
    averageScore: Number(average(item.values).toFixed(1)),
  }))
}

function miniComment(status: ArchiveItem['status']) {
  if (status === 'REVIEWED') return '已确认'
  if (status === 'AI_DONE') return '待确认'
  if (status === 'AI_PROCESSING') return 'AI评阅中'
  if (status === 'TEXT_EXTRACTING') return '识别中'
  if (status === 'TEXT_PENDING_CORRECTION') return '等待校核正文'
  return '待处理'
}

export function ArchivePage() {
  const [filters, setFilters] = useState<{
    classId: string
    studentId: string
    keyword: string
    status: StatusFilter
    scoreBucket: ScoreBucket
  }>({
    classId: '',
    studentId: '',
    keyword: '',
    status: '',
    scoreBucket: '',
  })
  const [page, setPage] = useState(1)

  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })

  const studentsQuery = useQuery({
    queryKey: ['students', 'archive-all'],
    queryFn: () => apiFetch<StudentItem[]>('/students'),
  })

  const archiveQuery = useQuery({
    queryKey: ['archive', filters.classId, filters.studentId, filters.keyword],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.classId) params.set('classId', filters.classId)
      if (filters.studentId) params.set('studentId', filters.studentId)
      if (filters.keyword) params.set('keyword', filters.keyword)
      return apiFetch<ArchiveItem[]>(`/archive/submissions?${params.toString()}`)
    },
  })

  const filteredStudents = useMemo(() => {
    const students = studentsQuery.data ?? []
    if (!filters.classId) return students
    return students.filter((item) => item.classId === filters.classId)
  }, [filters.classId, studentsQuery.data])

  const studentMap = useMemo(() => {
    return new Map((studentsQuery.data ?? []).map((item) => [item.id, item]))
  }, [studentsQuery.data])

  const decoratedItems = useMemo(() => {
    return (archiveQuery.data ?? []).map((item) => {
      const student = item.student?.id ? studentMap.get(item.student.id) : undefined
      const score = item.review?.scoreTotal ?? null
      return {
        ...item,
        score,
        studentName: item.student?.name ?? item.detectedName ?? '未绑定',
        className: student?.class?.name ?? '未分班',
        finalPreview: item.review?.finalComment ?? item.review?.aiSummary ?? '暂无评语',
      }
    })
  }, [archiveQuery.data, studentMap])

  const visibleItems = useMemo(() => {
    return decoratedItems.filter((item) => {
      if (filters.status === 'REVIEWED' && item.status !== 'REVIEWED') return false
      if (filters.status === 'AI_DONE' && item.status !== 'AI_DONE') return false
      if (
        filters.status === 'PENDING' &&
        (item.status === 'REVIEWED' || item.status === 'AI_DONE')
      ) {
        return false
      }

      if (filters.scoreBucket && scoreBucketOf(item.score) !== filters.scoreBucket) {
        return false
      }

      if (filters.keyword.trim()) {
        const keyword = filters.keyword.trim().toLowerCase()
        const haystack = [
          item.studentName,
          item.className,
          item.task.title,
          item.finalPreview,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(keyword)) return false
      }

      return true
    })
  }, [decoratedItems, filters.keyword, filters.scoreBucket, filters.status])

  useEffect(() => {
    setPage(1)
  }, [filters.classId, filters.studentId, filters.keyword, filters.scoreBucket, filters.status])

  const stats = useMemo(() => {
    const scored = visibleItems
      .map((item) => item.score)
      .filter((value): value is number => value != null)
    const reviewed = visibleItems.filter((item) => item.status === 'REVIEWED')
    const aiDone = visibleItems.filter((item) => item.status === 'AI_DONE')
    const pending = visibleItems.filter(
      (item) => item.status !== 'REVIEWED' && item.status !== 'AI_DONE',
    )
    const excellent = visibleItems.filter((item) => (item.score ?? 0) >= 40)
    const now = new Date()
    const currentMonth = startOfMonth(now)
    const lastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const addedThisMonth = visibleItems.filter(
      (item) => new Date(item.createdAt) >= currentMonth,
    ).length
    const addedLastMonth = visibleItems.filter((item) => {
      const time = new Date(item.createdAt)
      return time >= lastMonth && time < currentMonth
    }).length

    const delta = addedThisMonth - addedLastMonth

    return {
      total: visibleItems.length,
      reviewed: reviewed.length,
      aiDone: aiDone.length,
      pending: pending.length,
      averageScore: Number(average(scored).toFixed(1)),
      excellent: excellent.length,
      addedThisMonth,
      addedDelta: delta,
    }
  }, [visibleItems])

  const trendData = useMemo(
    () => getRecentMonthSeries(visibleItems),
    [visibleItems],
  )

  const latestPending = useMemo(() => {
    return visibleItems
      .filter((item) => item.status !== 'REVIEWED')
      .slice()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
  }, [visibleItems])

  const rankingData = useMemo(() => {
    const map = new Map<string, number[]>()
    visibleItems.forEach((item) => {
      if (item.score == null) return
      if (!map.has(item.className)) map.set(item.className, [])
      map.get(item.className)?.push(item.score)
    })
    return Array.from(map.entries())
      .map(([className, scores]) => ({
        className,
        averageScore: Number(average(scores).toFixed(1)),
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5)
  }, [visibleItems])

  const distributionData = useMemo(() => {
    const buckets = [
      { name: '40分以上', value: 0, color: '#2563eb' },
      { name: '36-39分', value: 0, color: '#10b981' },
      { name: '30-35分', value: 0, color: '#f59e0b' },
      { name: '待评分', value: 0, color: '#94a3b8' },
    ]
    visibleItems.forEach((item) => {
      const bucket = scoreBucketOf(item.score)
      if (bucket === 'high') buckets[0].value += 1
      if (bucket === 'mid') buckets[1].value += 1
      if (bucket === 'low') buckets[2].value += 1
      if (bucket === 'pending') buckets[3].value += 1
    })
    return buckets.filter((item) => item.value > 0)
  }, [visibleItems])

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize))
  const pagedItems = visibleItems.slice((page - 1) * pageSize, page * pageSize)

  const statCards = [
    {
      label: '作文总数',
      value: `${stats.total}`,
      hint: '当前筛选结果',
      icon: FileText,
      tone: 'blue',
    },
    {
      label: '教师已确认',
      value: `${stats.reviewed}`,
      hint: stats.total ? `${Math.round((stats.reviewed / stats.total) * 100)}%` : '0%',
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      label: '待处理',
      value: `${stats.pending + stats.aiDone}`,
      hint: stats.total ? `${Math.round(((stats.pending + stats.aiDone) / stats.total) * 100)}%` : '0%',
      icon: Clock3,
      tone: 'amber',
    },
    {
      label: '平均分',
      value: stats.averageScore ? formatScore(stats.averageScore) : '--',
      hint: '按当前筛选计算',
      icon: TrendingUp,
      tone: 'cyan',
    },
    {
      label: '优秀作文',
      value: `${stats.excellent}`,
      hint: '40分及以上',
      icon: Sparkles,
      tone: 'violet',
    },
    {
      label: '本月新增',
      value: `${stats.addedThisMonth}`,
      hint:
        stats.addedDelta === 0
          ? '较上月持平'
          : `较上月 ${stats.addedDelta > 0 ? '+' : ''}${stats.addedDelta}`,
      icon: CalendarDays,
      tone: 'indigo',
    },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.28em] text-stone-400">Archive</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink">作文档案</h1>
            <p className="mt-2 text-sm text-stone-500">
              汇总管理作文记录，支持按班级、学生与评分状态快速检索。
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-6">
        {statCards.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.label}
              className="rounded-[20px] border-stone-200 px-4 py-6 shadow-none"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    item.tone === 'blue' && 'bg-blue-50 text-blue-600',
                    item.tone === 'green' && 'bg-emerald-50 text-emerald-600',
                    item.tone === 'amber' && 'bg-amber-50 text-amber-600',
                    item.tone === 'cyan' && 'bg-cyan-50 text-cyan-600',
                    item.tone === 'violet' && 'bg-violet-50 text-violet-600',
                    item.tone === 'indigo' && 'bg-indigo-50 text-indigo-600',
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-none text-stone-500">
                    {item.label}
                  </p>
                  <div className="mt-2.5 flex items-end gap-2">
                    <p className="text-[26px] font-black leading-none text-ink">
                      {item.value}
                    </p>
                    <p className="truncate pb-0.5 text-xs text-stone-500">
                      {item.hint}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.75fr_0.65fr]">
        <div className="space-y-6">
          <Card className="rounded-[24px] p-4 shadow-none">
            <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <Input
                  className="pl-9"
                  placeholder="搜索作文题、学生姓名或评语关键词"
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                />
              </div>
              <select
                className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
                value={filters.classId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    classId: event.target.value,
                    studentId: '',
                  }))
                }
              >
                <option value="">全部班级</option>
                {classesQuery.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
                value={filters.studentId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, studentId: event.target.value }))
                }
              >
                <option value="">全部学生</option>
                {filteredStudents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as StatusFilter,
                  }))
                }
              >
                <option value="">全部状态</option>
                <option value="REVIEWED">已审核</option>
                <option value="AI_DONE">已完成</option>
                <option value="PENDING">处理中</option>
              </select>
              <Button
                className="h-11"
                variant="secondary"
                onClick={() =>
                  setFilters({
                    classId: '',
                    studentId: '',
                    keyword: '',
                    status: '',
                    scoreBucket: '',
                  })
                }
              >
                <RotateCcw className="mr-2 size-4" />
                重置
              </Button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <select
                className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-accent"
                value={filters.scoreBucket}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    scoreBucket: event.target.value as ScoreBucket,
                  }))
                }
              >
                <option value="">全部分数段</option>
                <option value="high">40分以上</option>
                <option value="mid">36-39分</option>
                <option value="low">30-35分</option>
                <option value="pending">待评分</option>
              </select>
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-stone-500">
                <Filter className="size-4 text-stone-400" />
                当前结果 {visibleItems.length} 篇
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-[24px] p-0 shadow-none">
            {archiveQuery.isError ? (
              <div className="border-b border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                档案数据加载失败：{(archiveQuery.error as Error).message}
              </div>
            ) : null}
            {!archiveQuery.isError && visibleItems.length === 0 ? (
              <div className="border-b border-stone-200 bg-stone-50 px-5 py-4 text-sm text-stone-500">
                当前筛选条件下没有作文记录。
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] text-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">作文信息</th>
                    <th className="w-[120px] px-5 py-4 font-medium">学生姓名</th>
                    <th className="px-5 py-4 font-medium">班级</th>
                    <th className="w-[180px] px-5 py-4 font-medium">提交时间</th>
                    <th className="w-[80px] px-5 py-4 font-medium">AI评分</th>
                    <th className="w-[120px] px-5 py-4 font-medium">批改状态</th>
                    <th className="px-5 py-4 font-medium">终稿摘要</th>
                    <th className="w-[80px] px-5 py-4 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item) => (
                    <tr key={item.id} className="border-t border-stone-100 align-top">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-accent">
                            <FileText className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{item.task.title}</p>
                            <p className="mt-1 text-xs text-stone-500">
                              {miniComment(item.status)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-ink">{item.studentName}</td>
                      <td className="px-5 py-4 text-stone-600">{item.className}</td>
                      <td className="px-5 py-4 text-stone-600">{formatDate(item.createdAt)}</td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'inline-flex min-w-[78px] items-center justify-center rounded-xl px-3 py-2 text-sm font-black',
                            item.score == null && 'bg-stone-100 text-stone-400',
                            item.score != null && item.score >= 40 && 'bg-emerald-50 text-emerald-700',
                            item.score != null &&
                              item.score >= 36 &&
                              item.score < 40 &&
                              'bg-orange-50 text-orange-700',
                            item.score != null &&
                              item.score < 36 &&
                              'bg-amber-50 text-amber-700',
                          )}
                        >
                          {item.score == null ? '--' : `${item.score}分`}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={getSubmissionStatusMeta(item.status).tone}>
                          {getSubmissionStatusMeta(item.status).label}
                        </Badge>
                      </td>
                      <td className="max-w-[320px] px-5 py-4 text-stone-600">
                        <p className="line-clamp-2">{item.finalPreview}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Link className="font-semibold text-accent" to={`/submissions/${item.id}`}>
                          详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 px-5 py-4">
              <p className="text-sm text-stone-500">共 {visibleItems.length} 篇作文记录</p>
              <div className="flex items-center gap-2">
                <Button
                  disabled={page <= 1}
                  className="h-10 w-10 p-0"
                  variant="secondary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600">
                  {page} / {totalPages}
                </span>
                <Button
                  disabled={page >= totalPages}
                  className="h-10 w-10 p-0"
                  variant="secondary"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[24px] p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">整体趋势</h3>
                <p className="mt-1 text-sm text-stone-500">近 6 个月平均分变化</p>
              </div>
              <TrendingUp className="size-5 text-accent" />
            </div>
            <div className="mt-4">
              <ChartContainer className="h-[210px] w-full" config={chartConfig}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <XAxis
                      axisLine={false}
                      dataKey="month"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      domain={[0, 50]}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '16px',
                        borderColor: '#dbeafe',
                        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
                      }}
                      formatter={(value) => [
                        `${formatScore(Number(value ?? 0))} 分`,
                        '平均分',
                      ]}
                    />
                    <Line
                      dataKey="averageScore"
                      dot={{ fill: '#2563eb', r: 4, strokeWidth: 0 }}
                      stroke="var(--color-trend)"
                      strokeLinecap="round"
                      strokeWidth={3}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </Card>

          <Card className="rounded-[24px] p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">待处理提醒</h3>
                <p className="mt-1 text-sm text-stone-500">优先关注尚未教师确认的作文</p>
              </div>
              <Clock3 className="size-5 text-amber-500" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-rose-50 px-4 py-4">
                <p className="text-sm text-stone-500">待处理作文</p>
                <p className="mt-2 text-3xl font-black text-ink">{stats.pending + stats.aiDone}</p>
                <p className="mt-2 text-sm text-rose-500">
                  AI已完成 {stats.aiDone}，处理中 {stats.pending}
                </p>
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-4">
                <p className="text-sm text-stone-500">最近待处理</p>
                <p className="mt-2 text-base font-bold text-ink">
                  {latestPending ? formatDate(latestPending.createdAt) : '--'}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-stone-500">
                  {latestPending?.task.title ?? '当前没有待处理作文'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-[24px] p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">班级平均分排行</h3>
                <p className="mt-1 text-sm text-stone-500">按当前筛选范围计算</p>
              </div>
              <BarChart3 className="size-5 text-accent" />
            </div>
            <div className="mt-5 space-y-4">
              {rankingData.length ? (
                rankingData.map((item, index) => {
                  const maxValue = rankingData[0]?.averageScore || 1
                  return (
                    <div key={item.className} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                      <span className="text-sm font-semibold text-stone-500">{index + 1}</span>
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-ink">{item.className}</span>
                          <span className="font-semibold text-stone-500">
                            {formatScore(item.averageScore)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-stone-100">
                          <div
                            className="h-2 rounded-full bg-accent"
                            style={{ width: `${(item.averageScore / maxValue) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-stone-400">分</span>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-stone-500">当前没有可统计的班级分数。</p>
              )}
            </div>
          </Card>

          <Card className="rounded-[24px] p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">分数分布</h3>
                <p className="mt-1 text-sm text-stone-500">按 AI 总分划分区间</p>
              </div>
              <PieChartIcon className="size-5 text-accent" />
            </div>
            <div className="mt-4 grid items-center gap-4 lg:grid-cols-[150px_1fr]">
              <ChartContainer className="h-[150px] w-full" config={chartConfig}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      dataKey="value"
                      innerRadius={40}
                      outerRadius={64}
                      paddingAngle={3}
                    >
                      {distributionData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '16px',
                        borderColor: '#e2e8f0',
                        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>

              <div className="space-y-3">
                {distributionData.length ? (
                  distributionData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-stone-600">{item.name}</span>
                      </div>
                      <span className="font-semibold text-ink">{item.value} 篇</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">当前没有可统计的分数数据。</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
