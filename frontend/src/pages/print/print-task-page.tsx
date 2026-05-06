import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { ReviewScorePill } from '../../components/review/score-display'
import type { TaskPrintData } from '../../types/api'
import { PrintReviewContent } from './print-review-content'

type PrintMode = 'compact' | 'detail'

export function PrintTaskPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const mode: PrintMode =
    searchParams.get('mode') === 'detail' ? 'detail' : 'compact'
  const query = useQuery({
    queryKey: ['print-task', id],
    queryFn: () => apiFetch<TaskPrintData>(`/tasks/${id}/print`),
  })

  useEffect(() => {
    if (query.data) {
      window.setTimeout(() => window.print(), 300)
    }
  }, [query.data])

  if (!query.data) {
    return <div className="p-8 text-sm text-stone-500">加载打印内容...</div>
  }

  if (mode === 'detail') {
    return (
      <div className="mx-auto max-w-[820px] bg-white px-10 py-12 text-[15px] leading-8 text-stone-800 print:max-w-none print:px-6 print:py-8">
        {query.data.items.map((item) => (
          <PrintReviewContent
            key={item.submissionId}
            className={query.data.className}
            pageBreak
            score={item.score}
            sections={item.sections}
            studentName={item.studentName}
            teacherFinalComment={item.teacherFinalComment}
            taskTitle={query.data.taskTitle}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] bg-white px-10 py-12 text-[15px] leading-8 text-stone-800 print:max-w-none print:px-6 print:py-8">
      <header className="border-b border-stone-300 pb-6">
        <h1 className="text-3xl font-black text-stone-900">{query.data.taskTitle}</h1>
        <p className="mt-3 text-sm text-stone-500">{query.data.className}</p>
      </header>

      <main className="space-y-10 pt-8">
        {query.data.items.map((item) => (
          <section
            key={item.submissionId}
            className="break-inside-avoid border-b border-dashed border-stone-300 pb-8 last:border-b-0"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold text-stone-900">{item.studentName}</h2>
              <ReviewScorePill
                className="rounded-lg px-3 py-2"
                label={null}
                score={item.score}
                showMax={false}
              />
            </div>
            <p className="mt-3 whitespace-pre-wrap">{item.finalComment}</p>
          </section>
        ))}
      </main>
    </div>
  )
}
