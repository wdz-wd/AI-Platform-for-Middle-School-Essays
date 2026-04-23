import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import type { SubmissionPrintData } from '../../types/api'

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
      <header className="border-b border-stone-300 pb-6">
        <h1 className="text-3xl font-black text-stone-900">作文点评单</h1>
        <p className="mt-3 text-sm text-stone-500">
          {query.data.className} · {query.data.studentName}
        </p>
        <p className="mt-2 font-semibold text-stone-800">{query.data.taskTitle}</p>
      </header>

      <main className="space-y-6 pt-8">
        <section>
          <h2 className="font-bold text-stone-900">最终评语</h2>
          <p className="mt-2 whitespace-pre-wrap">{query.data.finalComment}</p>
        </section>
        <section>
          <h2 className="font-bold text-stone-900">AI 结构化点评</h2>
          <div className="mt-2 space-y-4">
            <p><strong>总体评价：</strong>{query.data.sections.summary}</p>
            <p><strong>亮点概述：</strong>{query.data.sections.strengths}</p>
            <p><strong>主要问题：</strong>{query.data.sections.issues}</p>
            <p><strong>修改建议：</strong>{query.data.sections.suggestions}</p>
            <p><strong>参考修改：</strong>{query.data.sections.rewriteExample}</p>
          </div>
        </section>
      </main>
    </div>
  )
}
