import { BookText, FileText, MessageSquareText, Network } from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer } from '../ui/chart'
import { cn } from '../../lib/utils'
import type { ReviewScore } from '../../types/api'

const dimensionConfig = [
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
    icon: Network,
    color: 'bg-violet-50 text-violet-600',
  },
  {
    key: 'language',
    label: '语言',
    max: 10,
    icon: MessageSquareText,
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    key: 'idea',
    label: '立意',
    max: 10,
    icon: BookText,
    color: 'bg-amber-50 text-amber-600',
  },
] as const

function scoreSurface(score?: ReviewScore | null) {
  const total = score?.total
  if (total == null) {
    return 'border-stone-200 bg-stone-50 text-stone-400'
  }
  if (total >= 40) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  }
  if (total >= 36) {
    return 'border-orange-200 bg-orange-50 text-orange-700'
  }
  if (total >= 30) {
    return 'border-amber-300 bg-amber-50 text-amber-800'
  }
  return 'border-rose-300 bg-rose-50 text-rose-700'
}

function ringSurface(score?: ReviewScore | null) {
  const total = score?.total ?? 0
  const ratio = Math.max(0, Math.min(100, (total / 50) * 100))
  return {
    background: `conic-gradient(#2563eb 0 ${ratio}%, #dbeafe ${ratio}% 100%)`,
  }
}

const chartConfig = {
  score: {
    label: '评分',
    color: '#2563eb',
  },
} satisfies Record<string, { label?: string; color?: string }>

export function ReviewScorePill({
  score,
  className,
  compact = false,
}: {
  score?: ReviewScore | null
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-2xl border px-4 py-3',
        scoreSurface(score),
        compact && 'px-3 py-2',
        className,
      )}
    >
      <div>
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-[0.18em]',
            compact && 'text-[10px]',
          )}
        >
          AI评分
        </p>
        <p
          className={cn(
            'mt-1 text-3xl font-black leading-none',
            compact && 'text-xl',
          )}
        >
          {score?.total == null ? '--' : score.total}
          <span className={cn('ml-1 text-sm font-semibold', compact && 'text-xs')}>
            /50
          </span>
        </p>
      </div>
    </div>
  )
}

export function ReviewScorePanel({
  score,
  className,
  embedded = false,
}: {
  score?: ReviewScore | null
  className?: string
  embedded?: boolean
}) {
  const radarData = [
    {
      subject: '内容',
      score: ((score?.content ?? 0) / 20) * 100,
      rawScore: score?.content ?? null,
      max: 20,
    },
    {
      subject: '结构',
      score: ((score?.structure ?? 0) / 10) * 100,
      rawScore: score?.structure ?? null,
      max: 10,
    },
    {
      subject: '语言',
      score: ((score?.language ?? 0) / 10) * 100,
      rawScore: score?.language ?? null,
      max: 10,
    },
    {
      subject: '立意',
      score: ((score?.idea ?? 0) / 10) * 100,
      rawScore: score?.idea ?? null,
      max: 10,
    },
  ]

  return (
    <section className={cn(!embedded && 'rounded-2xl border border-stone-200 bg-white p-5', className)}>
      <h3 className="text-lg font-bold text-ink">AI 评分总览</h3>
      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_260px] lg:justify-between">
        <div className="flex items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 p-5">
          <div
            className="flex w-[136px] items-center justify-center rounded-full p-3"
            style={ringSurface(score)}
          >
            <div className="flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full bg-white text-ink shadow-sm">
              <p className="text-4xl font-black leading-none">
                {score?.total == null ? '--' : score.total}
              </p>
              <p className="mt-2 text-sm font-medium text-stone-500">综合评分 / 50</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
          <div className="flex items-center justify-center">
            <ChartContainer className="h-[220px] w-full max-w-[240px]" config={chartConfig}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="52%"
                  data={radarData}
                  outerRadius="72%"
                >
                  <PolarGrid
                    className="[&_polygon]:stroke-blue-100 [&_line]:stroke-blue-100"
                    gridType="polygon"
                  />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{
                      fill: '#475569',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  <PolarRadiusAxis axisLine={false} domain={[0, 100]} tick={false} />
                  <Radar
                    dataKey="score"
                    dot={{ fill: '#2563eb', r: 3.5, strokeWidth: 0 }}
                    fill="var(--color-score)"
                    fillOpacity={0.22}
                    stroke="var(--color-score)"
                    strokeWidth={2.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ReviewDimensionCards({
  score,
  comments,
  className,
}: {
  score?: ReviewScore | null
  comments: Record<'content' | 'structure' | 'language' | 'idea', string>
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-stone-200 bg-white p-5',
        className,
      )}
    >
      <h3 className="text-lg font-bold text-ink">四个维度评语</h3>
      <div className="mt-4 space-y-3">
        {dimensionConfig.map((item) => {
          const Icon = item.icon
          const value = score?.[item.key] ?? null
          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    item.color,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="truncate text-sm text-stone-500">{comments[item.key]}</p>
                </div>
              </div>
              <p className="shrink-0 text-xl font-black text-accent">
                {value == null ? '--' : value}
                <span className="ml-1 text-sm font-semibold text-stone-400">
                  / {item.max}
                </span>
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
