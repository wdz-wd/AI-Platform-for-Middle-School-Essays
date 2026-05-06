import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import type { SubmissionPrintData } from '../../types/api'
import { PrintReviewContent } from './print-review-content'

export function PrintSubmissionPage() {
  const { id = '' } = useParams()
  const query = useQuery({
    queryKey: ['print-submission', id],
    queryFn: () => apiFetch<SubmissionPrintData>(`/reviews/${id}/print`),
  })

  useEffect(() => {
    if (query.data) {
      window.setTimeout(() => window.print(), 300)
    }
  }, [query.data])

  if (!query.data) {
    return <div className="p-8 text-sm text-stone-500">加载打印内容...</div>
  }

  return (
    <div className="mx-auto max-w-[820px] bg-white px-10 py-12 text-[15px] leading-8 text-stone-800 print:max-w-none print:px-6 print:py-8">
      <PrintReviewContent
        className={query.data.className}
        score={query.data.score}
        sections={query.data.sections}
        studentName={query.data.studentName}
        teacherFinalComment={query.data.teacherFinalComment}
        taskTitle={query.data.taskTitle}
      />
    </div>
  )
}
